import { create } from "zustand";
import type { AgentId, AgentState, ContextEvent } from "@idex/types";
import { ipc } from "@/lib/ipc";

interface AgentStore {
  state: AgentState;
  agentId: AgentId | null;
  cwd: string | null;
  events: ContextEvent[];
  lastError: string | null;

  bindStreams: () => () => void;
  spawn: (agentId: AgentId, cwd: string) => Promise<{ ok: boolean; error?: string }>;
  send: (text: string) => Promise<void>;
  kill: () => Promise<void>;
  pushUserEvent: (text: string) => void;
}

export const useAgent = create<AgentStore>((set, get) => ({
  state: "idle",
  agentId: null,
  cwd: null,
  events: [] as ContextEvent[],
  lastError: null,

  bindStreams() {
    const offState = ipc().agent.onState((s: string) => {
      set({ state: s as AgentState });
      if (s === "done") {
        const { events } = get();
        const lastChunk = [...events].reverse().find((e) => e.kind === "agent_chunk");
        if (lastChunk && "text" in lastChunk) {
          const doneEvent: ContextEvent = {
            kind: "agent_done",
            text: lastChunk.text,
            ts: Date.now(),
          };
          set({ events: [...events, doneEvent] });
        }
      }
    });
    const offOutput = ipc().agent.onOutput((chunk: { raw: string; clean: string; ts: number }) => {
      if (!chunk.clean.trim()) return;
      const evt: ContextEvent = {
        kind: "agent_chunk",
        text: chunk.clean,
        ts: chunk.ts,
      };
      set((s) => ({ events: [...s.events, evt].slice(-200) }));
    });
    return () => {
      offState();
      offOutput();
    };
  },

  async spawn(agentId, cwd) {
    set({ agentId, cwd, lastError: null });
    const r = await ipc().agent.spawn({ agentId, cwd });
    if (!r.ok) {
      set({ lastError: r.error ?? "Failed to spawn agent" });
    }
    return r;
  },

  async send(text) {
    const t = text.trim();
    if (!t) return;
    get().pushUserEvent(t);
    // Optimistically switch to generating so the feed pane reacts immediately.
    // The main process will issue authoritative state updates as the PTY streams.
    set({ state: "generating" });
    // Append \r so Claude Code's TUI treats it as a submitted line.
    await ipc().agent.input({ text: `${t}\r` });
  },

  async kill() {
    await ipc().agent.kill();
    set({ state: "idle" });
  },

  pushUserEvent(text) {
    const evt: ContextEvent = { kind: "user_input", text, ts: Date.now() };
    set((s) => ({ events: [...s.events, evt].slice(-200) }));
  },
}));
