import { create } from "zustand";
import type { AgentId, AgentState, ContextEvent } from "@idex/types";
import { ipc } from "@/lib/ipc";

interface AgentStore {
  state: AgentState;
  agentId: AgentId | null;
  cwd: string | null;
  /** Cleaned conversation events, used for the Conversation pane and Curator. */
  events: ContextEvent[];
  /** Last error message, if spawn failed. */
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
  events: [],
  lastError: null,

  bindStreams() {
    const offState = ipc().agent.onState((s) => {
      set({ state: s as AgentState });
      if (s === "done") {
        // Coalesce buffered chunks into an agent_done event for context bus
        const { events } = get();
        const lastChunk = [...events].reverse().find((e) => e.kind === "agent_chunk");
        if (lastChunk) {
          set({
            events: [
              ...events,
              { kind: "agent_done", text: lastChunk.text, ts: Date.now() },
            ],
          });
        }
      }
    });
    const offOutput = ipc().agent.onOutput((chunk) => {
      // Push agent_chunk events for the curator. Cockpit terminal is fed separately.
      if (!chunk.clean.trim()) return;
      set((s) => ({
        events: [
          ...s.events,
          { kind: "agent_chunk", text: chunk.clean, ts: chunk.ts },
        ].slice(-200),
      }));
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
    await ipc().agent.input({ text: t });
  },

  async kill() {
    await ipc().agent.kill();
    set({ state: "idle" });
  },

  pushUserEvent(text) {
    set((s) => ({
      events: [...s.events, { kind: "user_input", text, ts: Date.now() }].slice(-200),
    }));
  },
}));
