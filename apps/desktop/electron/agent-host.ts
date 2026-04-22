import { spawn, type IPty } from "node-pty";
import os from "node:os";
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
}

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
      FORCE_COLOR: "1",
    };

    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      `${os.homedir()}/.volta/bin`,
      `${os.homedir()}/.bun/bin`,
      `${os.homedir()}/.pnpm/bin`,
    ];
    const fs = await import("node:fs");
    const nvmRoot = `${os.homedir()}/.nvm/versions/node`;
    try {
      if (fs.existsSync(nvmRoot)) {
        for (const v of fs.readdirSync(nvmRoot)) extraPaths.push(`${nvmRoot}/${v}/bin`);
      }
    } catch { /* ignore */ }
    env["PATH"] = [...extraPaths, env["PATH"] ?? ""].filter(Boolean).join(":");

    const cwd = opts.cwd || os.homedir();
    const label =
      opts.label ??
      `${adapter.displayName} · ${cwd.replace(os.homedir(), "~").split("/").slice(-2).join("/") || "~"}`;

    console.log(`[idex] spawn session=${sessionId} agent=${opts.agentId} cwd=${cwd}`);

    let pty: IPty;
    try {
      pty = spawn(command.cmd, command.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd,
        env: env as { [key: string]: string },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[idex] spawn failed: ${msg}`);
      return {
        ok: false,
        error: `Failed to spawn '${command.cmd}': ${msg}. Is it installed and on PATH?`,
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
    };
    this.sessions.set(sessionId, session);
    this.emitState(sessionId, "idle");

    pty.onData((data) => this.handleData(sessionId, data));
    pty.onExit(() => {
      console.log(`[idex] session ${sessionId} exited`);
      this.sessions.delete(sessionId);
      // Natural exit (user typed `exit`, ctrl-D, etc.) → idle. Don't flash
      // the tab red for graceful exits. Real spawn failures never reach
      // onExit because they throw synchronously from pty.spawn().
      this.cbs?.onState({ sessionId, state: "idle" });
    });

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

  private handleData(sessionId: string, raw: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const adapter = getAdapter(session.agentId);
    session.buffer += raw;
    session.lastChunkAt = Date.now();

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
    try { session.pty.resize(cols, rows); } catch { /* ignore */ }
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
