import { spawn, type IPty } from "node-pty";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAdapter } from "@idex/adapters";
import type {
  AgentSpawnOptions,
  AgentOutputChunk,
  AgentState,
  AgentStateEvent,
  Session,
  AgentId,
} from "@idex/types";

interface ActiveSession {
  id: string;
  pty: IPty;
  agentId: AgentId;
  cwd: string;
  label: string;
  createdAt: number;
  buffer: string;
  lastChunkAt: number;
  idleTimer: NodeJS.Timeout | null;
  lastEmittedState: AgentState | null;
  state: AgentState;
  /**
   * True when we couldn't find the agent binary and dropped into the user's
   * $SHELL as a fallback. Adapter boundary detection is skipped so the shell
   * doesn't flash "done" on every prompt draw.
   */
  isShellFallback: boolean;
}

/** Install commands we print when the agent binary is missing. */
const INSTALL_HINTS: Record<AgentId, string> = {
  "claude-code": "npm install -g @anthropic-ai/claude-code   # then run `claude`",
  codex: "npm install -g @openai/codex   # then run `codex`",
  freebuff: "npm install -g freebuff   # then run `freebuff`",
  shell: "# your shell is already installed",
};

/**
 * Idle fallback before we declare the agent "done". Claude Code's TUI
 * paints a spinner frame every ~100ms while working — that's continuous
 * output. The old 350ms was too tight: the spinner kept resetting the
 * timer and the feed never got a chance to collapse. 2s gives us a
 * confident "yes, the agent has actually stopped producing content" and
 * still feels snappy for short answers.
 */
const IDLE_BOUNDARY_MS = 2000;

interface HostCallbacks {
  onOutput: (chunk: AgentOutputChunk) => void;
  onState: (event: AgentStateEvent) => void;
}

class AgentHost {
  private sessions = new Map<string, ActiveSession>();
  private cbs: HostCallbacks | null = null;

  setCallbacks(cbs: HostCallbacks) {
    this.cbs = cbs;
  }

  async spawn(opts: AgentSpawnOptions): Promise<{ ok: boolean; error?: string; session?: Session }> {
    const sessionId = opts.sessionId ?? randomUUID();
    const adapter = getAdapter(opts.agentId);
    const command = adapter.getCommand();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(opts.env ?? {}),
      TERM: process.env["TERM"] ?? "xterm-256color",
      COLORTERM: process.env["COLORTERM"] ?? "truecolor",
      FORCE_COLOR: "1",
      IDEX_SESSION_ID: sessionId,
      IDEX_AGENT_ID: opts.agentId,
    };

    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      `${os.homedir()}/.volta/bin`,
      `${os.homedir()}/.bun/bin`,
      `${os.homedir()}/.pnpm/bin`,
      `${os.homedir()}/.local/bin`,
      `${os.homedir()}/.cargo/bin`,
    ];
    const fs = await import("node:fs");
    const nvmRoot = `${os.homedir()}/.nvm/versions/node`;
    try {
      if (fs.existsSync(nvmRoot)) {
        for (const v of fs.readdirSync(nvmRoot)) extraPaths.push(`${nvmRoot}/${v}/bin`);
      }
    } catch { /* ignore */ }
    env["PATH"] = [...extraPaths, env["PATH"] ?? ""].filter(Boolean).join(path.delimiter);

    const cwd = opts.cwd || os.homedir();
    const label =
      opts.label ??
      `${adapter.displayName} · ${cwd.replace(os.homedir(), "~").split("/").slice(-2).join("/") || "~"}`;

    // Resolve agent binary against the augmented PATH. If it's not there,
    // don't fail — drop the user into their $SHELL with an install hint so
    // the app stays usable (the IDE is still an IDE even without the agent).
    const resolved = this.resolveBinary(command.cmd, env["PATH"]!);
    let spawnCmd = command.cmd;
    let spawnArgs = command.args;
    let isShellFallback = false;
    let fallbackBanner = "";
    if (!resolved) {
      const shell = this.pickShell(env);
      const hint = INSTALL_HINTS[opts.agentId] ?? "";
      const bold = "\x1b[1m";
      const dim = "\x1b[2m";
      const reset = "\x1b[0m";
      const red = "\x1b[31m";
      const cyan = "\x1b[36m";
      fallbackBanner =
        `\r\n${red}${bold}idex:${reset} couldn't find '${command.cmd}' on PATH.${reset}\r\n` +
        (hint ? `${dim}install:${reset} ${cyan}${hint}${reset}\r\n` : "") +
        `${dim}dropping into ${shell.cmd} — re-open the session once the agent is installed.${reset}\r\n\r\n`;
      spawnCmd = shell.cmd;
      spawnArgs = shell.args;
      isShellFallback = true;
      console.warn(`[idex] agent '${command.cmd}' not found; falling back to ${shell.cmd}`);
    }

    console.log(`[idex] spawn session=${sessionId} agent=${opts.agentId} cmd=${spawnCmd} cwd=${cwd} fallback=${isShellFallback}`);

    let pty: IPty;
    try {
      pty = spawn(spawnCmd, spawnArgs, {
        name: "xterm-256color",
        cols: opts.env?.COLS ? Number(opts.env.COLS) : 100,
        rows: opts.env?.ROWS ? Number(opts.env.ROWS) : 30,
        cwd,
        env: env as { [key: string]: string },
      });
    } catch (e) {
      // node-pty throws synchronously if execvp fails. Even our shell
      // fallback could in theory fail (no /bin/sh in the container). In
      // that case surface a real error to the renderer instead of a crash.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[idex] spawn failed: ${msg}`);
      this.cbs?.onState({ sessionId, state: "error" });
      return {
        ok: false,
        error: `Failed to spawn '${spawnCmd}': ${msg}. Is a shell available?`,
      };
    }

    const session: ActiveSession = {
      id: sessionId,
      pty,
      agentId: opts.agentId,
      cwd,
      label,
      createdAt: Date.now(),
      buffer: "",
      lastChunkAt: Date.now(),
      idleTimer: null,
      lastEmittedState: null,
      state: "idle",
      isShellFallback,
    };
    this.sessions.set(sessionId, session);
    this.emitState(sessionId, "idle");

    pty.onData((data) => this.handleData(sessionId, data));
    pty.onExit(({ exitCode, signal }) => {
      console.log(`[idex] session ${sessionId} exited code=${exitCode} signal=${signal ?? "-"}`);
      const hadSession = this.sessions.has(sessionId);
      this.sessions.delete(sessionId);
      if (!hadSession) return;
      // A non-zero exit within the first 2s almost always means the shell
      // we dropped into choked on something — push the exit code into the
      // terminal so the user knows.
      const diedFast = Date.now() - session.createdAt < 2000;
      if (exitCode !== 0 && diedFast) {
        const msg =
          `\r\n\x1b[31m[idex] ${spawnCmd} exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}.\x1b[0m\r\n`;
        this.cbs?.onOutput({
          sessionId,
          raw: msg,
          clean: msg.replace(/\x1b\[[0-9;]*m/g, ""),
          ts: Date.now(),
        });
        this.cbs?.onState({ sessionId, state: "error" });
        return;
      }
      // Natural exit (user typed `exit`, ctrl-D, etc.) → idle. Don't flash
      // the tab red for graceful exits.
      this.cbs?.onState({ sessionId, state: "idle" });
    });

    // Print the fallback banner AFTER registering onData so the banner is
    // still picked up by the normal output pipeline (ensures the renderer
    // sees it even if it connects a tick late).
    if (fallbackBanner) {
      // setImmediate instead of process.nextTick so the renderer has a tick
      // to mount its listener after receiving the spawn success reply.
      setImmediate(() => {
        // For shell-fallback sessions, prepend DECRST 2004 (`\e[?2004l`) so
        // xterm.js stops wrapping pasted text in `\e[200~...\e[201~`. bash's
        // readline in a plain fallback shell doesn't filter those markers,
        // so users would otherwise see a literal `[200~pwd` on the prompt.
        // The escape goes through onOutput (→ xterm's parser), NOT pty.write
        // (which would send it to bash's stdin and be echoed back literally).
        // Agent-backed sessions (claude, codex, freebuff) negotiate bracketed
        // paste themselves, so we only do this on the fallback path.
        const prefix = isShellFallback ? "\x1b[?2004l" : "";
        const raw = prefix + fallbackBanner;
        this.cbs?.onOutput({
          sessionId,
          raw,
          clean: fallbackBanner.replace(/\x1b\[[0-9;]*m/g, ""),
          ts: Date.now(),
        });
      });
    } else if (isShellFallback) {
      // Unreachable today (shell fallback always ships with a banner), but
      // keep the DECRST 2004 path independent of the banner so future
      // changes don't silently re-enable bracketed paste.
      setImmediate(() => {
        this.cbs?.onOutput({
          sessionId,
          raw: "\x1b[?2004l",
          clean: "",
          ts: Date.now(),
        });
      });
    }

    return {
      ok: true,
      session: {
        id: sessionId,
        agentId: opts.agentId,
        cwd,
        label,
        state: "idle",
        createdAt: session.createdAt,
      },
    };
  }

  /** Look up `bin` on PATH (or return the input if it's already absolute). */
  private resolveBinary(bin: string, pathEnv: string): string | null {
    if (!bin) return null;
    if (path.isAbsolute(bin)) {
      try {
        const fs = require("node:fs") as typeof import("node:fs");
        return fs.existsSync(bin) ? bin : null;
      } catch { return null; }
    }
    const fs = require("node:fs") as typeof import("node:fs");
    const exts = process.platform === "win32"
      ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
    for (const dir of pathEnv.split(path.delimiter)) {
      if (!dir) continue;
      for (const ext of exts) {
        const full = path.join(dir, bin + ext);
        try {
          if (fs.existsSync(full)) return full;
        } catch { /* ignore */ }
      }
    }
    return null;
  }

  /** Pick the user's preferred interactive shell, with sensible fallbacks. */
  private pickShell(env: Record<string, string>): { cmd: string; args: string[] } {
    if (process.platform === "win32") {
      const comspec = env["COMSPEC"] || "cmd.exe";
      return { cmd: comspec, args: [] };
    }
    const fromEnv = env["SHELL"];
    if (fromEnv) return { cmd: fromEnv, args: ["-l"] };
    const candidates = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    const fs = require("node:fs") as typeof import("node:fs");
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return { cmd: c, args: ["-l"] }; } catch { /* ignore */ }
    }
    return { cmd: "/bin/sh", args: [] };
  }

  private handleData(sessionId: string, raw: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.buffer += raw;
    session.lastChunkAt = Date.now();

    // When we fall back to a plain $SHELL, agent-adapter boundary detection
    // would misfire on every PS1 redraw — so we short-circuit. The shell is
    // always "idle" from the feed's perspective; the user is in charge.
    if (session.isShellFallback) {
      this.cbs?.onOutput({
        sessionId,
        raw,
        clean: raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""),
        ts: session.lastChunkAt,
      });
      return;
    }

    const adapter = getAdapter(session.agentId);
    const detection = adapter.detect({
      rawChunk: raw,
      bufferedSinceLastBoundary: session.buffer,
      ts: session.lastChunkAt,
    });

    this.cbs?.onOutput({
      sessionId,
      raw,
      clean: detection.cleanText,
      ts: session.lastChunkAt,
    });

    if (detection.userPromptBoundary) {
      session.buffer = "";
      this.emitState(sessionId, "done");
      this.clearIdleTimer(session);
    } else {
      this.armIdleTimer(session);
      this.emitState(sessionId, "generating");
    }
  }

  private emitState(sessionId: string, next: AgentState) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.lastEmittedState === next) return;
    session.lastEmittedState = next;
    session.state = next;
    this.cbs?.onState({ sessionId, state: next });
  }

  private armIdleTimer(session: ActiveSession) {
    this.clearIdleTimer(session);
    session.idleTimer = setTimeout(() => {
      if (!this.sessions.has(session.id)) return;
      this.emitState(session.id, "done");
      session.buffer = "";
    }, IDLE_BOUNDARY_MS);
  }

  private clearIdleTimer(session: ActiveSession) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }

  write(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.write(text);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    // node-pty asserts cols/rows >= 1 and will throw on 0 — guard here so
    // a transient (0,0) from ResizeObserver during window-minimize doesn't
    // tear down the PTY.
    const c = Math.max(2, Math.floor(cols));
    const r = Math.max(2, Math.floor(rows));
    try { session.pty.resize(c, r); } catch (e) {
      console.warn(`[idex] resize ${sessionId} -> ${c}x${r} failed:`, e);
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try { session.pty.kill(); } catch { /* ignore */ }
    this.clearIdleTimer(session);
    this.sessions.delete(sessionId);
    // User-initiated close → idle, not error. Reserve "error" for actual
    // failure states.
    this.cbs?.onState({ sessionId, state: "idle" });
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      agentId: s.agentId,
      cwd: s.cwd,
      label: s.label,
      state: s.state,
      createdAt: s.createdAt,
    }));
  }

  killAll(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.kill(id);
    }
  }
}

export const agentHost = new AgentHost();
