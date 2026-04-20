import { spawn, type IPty } from "node-pty";
import os from "node:os";
import { getAdapter } from "@idex/adapters";
import type {
  AgentSpawnOptions,
  AgentOutputChunk,
  AgentState,
} from "@idex/types";

interface ActiveSession {
  pty: IPty;
  agentId: AgentSpawnOptions["agentId"];
  buffer: string; // raw buffer since last detected boundary
  lastChunkAt: number;
  idleTimer: NodeJS.Timeout | null;
  lastEmittedState: AgentState | null;
}

const IDLE_BOUNDARY_MS = 350;

class AgentHost {
  private session: ActiveSession | null = null;
  private outputCb: ((chunk: AgentOutputChunk) => void) | null = null;
  private stateCb: ((state: AgentState) => void) | null = null;

  async spawn(
    opts: AgentSpawnOptions,
    onOutput: (chunk: AgentOutputChunk) => void,
    onState: (state: AgentState) => void,
  ): Promise<{ ok: boolean; error?: string }> {
    this.killCurrent();

    this.outputCb = onOutput;
    this.stateCb = onState;
    onState("spawning");

    const adapter = getAdapter(opts.agentId);
    const command = adapter.getCommand();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(opts.env ?? {}),
      // Force TTY-friendly behavior in agent CLIs
      TERM: process.env["TERM"] ?? "xterm-256color",
      FORCE_COLOR: "1",
    };

    // Expand PATH with common user/agent locations so nvm/homebrew/global npm
    // installs are found even when the app is launched via Finder (where
    // process.env.PATH is very minimal).
    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      `${os.homedir()}/.nvm/versions/node/*/bin`,
      `${os.homedir()}/.volta/bin`,
      `${os.homedir()}/.bun/bin`,
      `${os.homedir()}/.pnpm/bin`,
    ];
    // Glob-expand nvm paths synchronously
    const fs = await import("node:fs");
    const nvmRoot = `${os.homedir()}/.nvm/versions/node`;
    try {
      if (fs.existsSync(nvmRoot)) {
        const versions = fs.readdirSync(nvmRoot);
        for (const v of versions) extraPaths.push(`${nvmRoot}/${v}/bin`);
      }
    } catch { /* ignore */ }
    const existingPath = env["PATH"] ?? "";
    env["PATH"] = [...extraPaths, existingPath].filter(Boolean).join(":");

    console.log(`[idex] spawning: cmd=${command.cmd} cwd=${opts.cwd || os.homedir()}`);
    console.log(`[idex] PATH=${env["PATH"]}`);

    let pty: IPty;
    try {
      pty = spawn(command.cmd, command.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd: opts.cwd || os.homedir(),
        env: env as { [key: string]: string },
      });
      console.log(`[idex] spawned pid=${pty.pid}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[idex] spawn failed: ${msg}`);
      onState("error");
      return {
        ok: false,
        error: `Failed to spawn '${command.cmd}': ${msg}. Is it installed and on PATH?`,
      };
    }

    this.session = {
      pty,
      agentId: opts.agentId,
      buffer: "",
      lastChunkAt: Date.now(),
      idleTimer: null,
      lastEmittedState: null,
    };
    this.emitState("idle");

    pty.onData((data) => this.handleData(data));
    pty.onExit(() => {
      onState("idle");
      this.session = null;
    });

    return { ok: true };
  }

  private handleData(raw: string) {
    const session = this.session;
    if (!session) return;
    const adapter = getAdapter(session.agentId);
    session.buffer += raw;
    session.lastChunkAt = Date.now();

    const detection = adapter.detect({
      rawChunk: raw,
      bufferedSinceLastBoundary: session.buffer,
      ts: session.lastChunkAt,
    });

    this.outputCb?.({
      raw,
      clean: detection.cleanText,
      ts: session.lastChunkAt,
    });

    if (detection.userPromptBoundary) {
      session.buffer = "";
      this.emitState("done");
      this.clearIdleTimer();
    } else {
      this.armIdleTimer();
      // Only emit "generating" on the transition, not every chunk — otherwise
      // every keystroke echo causes a state flap and the feed expands/collapses
      // on every character.
      this.emitState("generating");
    }
  }

  private emitState(next: AgentState) {
    const session = this.session;
    if (!session) return;
    if (session.lastEmittedState === next) return;
    session.lastEmittedState = next;
    this.stateCb?.(next);
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    if (!this.session) return;
    this.session.idleTimer = setTimeout(() => {
      const session = this.session;
      if (!session) return;
      this.emitState("done");
      session.buffer = "";
    }, IDLE_BOUNDARY_MS);
  }

  private clearIdleTimer() {
    if (this.session?.idleTimer) {
      clearTimeout(this.session.idleTimer);
      this.session.idleTimer = null;
    }
  }

  /**
   * Write raw bytes to the PTY. The renderer is responsible for deciding
   * whether this is a keystroke (single char, no \r) or a full-message
   * submission (text + \r). We do NOT append anything here, otherwise
   * every single keystroke from xterm.onData would look like "h\r" and
   * Claude Code would submit on every letter.
   */
  write(text: string): void {
    if (!this.session) return;
    this.session.pty.write(text);
  }

  killCurrent(): void {
    if (!this.session) return;
    try { this.session.pty.kill(); } catch { /* ignore */ }
    this.clearIdleTimer();
    this.session = null;
    this.stateCb?.("idle");
    this.stateCb = null;
  }

  killAll(): void {
    this.killCurrent();
  }
}

export const agentHost = new AgentHost();
