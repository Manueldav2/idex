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

    const env = {
      ...process.env,
      ...(opts.env ?? {}),
      // Force TTY-friendly behavior in agent CLIs
      TERM: process.env["TERM"] ?? "xterm-256color",
      FORCE_COLOR: "1",
    };

    let pty: IPty;
    try {
      pty = spawn(command.cmd, command.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd: opts.cwd || os.homedir(),
        env: env as { [key: string]: string },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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
    };
    onState("idle");

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
      this.stateCb?.("done");
      this.clearIdleTimer();
    } else {
      this.armIdleTimer();
      this.stateCb?.("generating");
    }
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    if (!this.session) return;
    this.session.idleTimer = setTimeout(() => {
      const session = this.session;
      if (!session) return;
      // Idle threshold reached → treat as done.
      this.stateCb?.("done");
      session.buffer = "";
    }, IDLE_BOUNDARY_MS);
  }

  private clearIdleTimer() {
    if (this.session?.idleTimer) {
      clearTimeout(this.session.idleTimer);
      this.session.idleTimer = null;
    }
  }

  write(text: string): void {
    if (!this.session) return;
    // Append a newline if user didn't include one
    const payload = text.endsWith("\n") ? text : `${text}\r`;
    this.session.pty.write(payload);
    this.stateCb?.("generating");
  }

  killCurrent(): void {
    if (!this.session) return;
    try { this.session.pty.kill(); } catch { /* ignore */ }
    this.clearIdleTimer();
    this.session = null;
    this.stateCb?.("idle");
  }

  killAll(): void {
    this.killCurrent();
  }
}

export const agentHost = new AgentHost();
