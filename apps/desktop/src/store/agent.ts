import { create } from "zustand";
import type { AgentId, AgentState, ContextEvent, Session } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useFeed } from "./feed";

export interface SessionData {
  session: Session;
  events: ContextEvent[];
  lastError: string | null;
}

interface AgentStore {
  sessions: Record<string, SessionData>;
  order: string[];
  activeId: string | null;

  bindStreams: () => () => void;

  /** Create a new session + return its id. Also becomes the active session. */
  createSession: (opts?: { agentId?: AgentId; cwd?: string }) => Promise<{ ok: boolean; error?: string; id?: string }>;
  /** Switch active session. */
  setActive: (id: string) => void;
  /** Kill and remove a session. */
  closeSession: (id: string) => Promise<void>;

  /** Send a user prompt to the active session. */
  sendToActive: (text: string) => Promise<void>;
  /** Record a user_input event against a session. */
  pushUserEvent: (sessionId: string, text: string) => void;

  /** Derived helpers */
  getActive: () => SessionData | null;
  getActiveState: () => AgentState;
}

export const useAgent = create<AgentStore>((set, get) => ({
  sessions: {},
  order: [],
  activeId: null,

  bindStreams() {
    const offState = ipc().agent.onState((event) => {
      set((s) => {
        const existing = s.sessions[event.sessionId];
        if (!existing) return s;
        const updated: SessionData = {
          ...existing,
          session: { ...existing.session, state: event.state },
        };
        if (event.state === "done") {
          const lastChunk = [...existing.events].reverse().find((e) => e.kind === "agent_chunk");
          if (lastChunk && "text" in lastChunk) {
            updated.events = [
              ...existing.events,
              { kind: "agent_done" as const, text: lastChunk.text, ts: Date.now() },
            ];
          }
        }
        return { sessions: { ...s.sessions, [event.sessionId]: updated } };
      });
    });
    const offOutput = ipc().agent.onOutput((chunk) => {
      if (!chunk.clean.trim()) return;
      set((s) => {
        const existing = s.sessions[chunk.sessionId];
        if (!existing) return s;
        const evt: ContextEvent = {
          kind: "agent_chunk",
          text: chunk.clean,
          ts: chunk.ts,
        };
        const updated: SessionData = {
          ...existing,
          events: [...existing.events, evt].slice(-200),
        };
        return { sessions: { ...s.sessions, [chunk.sessionId]: updated } };
      });
    });
    return () => {
      offState();
      offOutput();
    };
  },

  async createSession(opts = {}) {
    const agentId: AgentId = opts.agentId ?? "claude-code";
    const cwd = opts.cwd ?? "";
    const r = await ipc().agent.spawn({ agentId, cwd });
    if (!r.ok || !r.session) {
      return { ok: false, error: r.error };
    }
    const session = r.session;
    set((s) => ({
      sessions: {
        ...s.sessions,
        [session.id]: { session, events: [], lastError: null },
      },
      order: [...s.order, session.id],
      activeId: session.id,
    }));
    return { ok: true, id: session.id };
  },

  setActive(id) {
    if (!get().sessions[id]) return;
    set({ activeId: id });
  },

  async closeSession(id) {
    await ipc().agent.kill(id);
    set((s) => {
      const { [id]: _removed, ...rest } = s.sessions;
      const newOrder = s.order.filter((x) => x !== id);
      const newActive =
        s.activeId === id ? newOrder[newOrder.length - 1] ?? null : s.activeId;
      return { sessions: rest, order: newOrder, activeId: newActive };
    });
  },

  async sendToActive(text) {
    const t = text.trim();
    if (!t) return;
    const active = get().activeId;
    if (!active) return;
    get().pushUserEvent(active, t);
    set((s) => {
      const existing = s.sessions[active];
      if (!existing) return s;
      return {
        sessions: {
          ...s.sessions,
          [active]: { ...existing, session: { ...existing.session, state: "generating" } },
        },
      };
    });
    useFeed.getState().setState("expanded");
    useFeed.getState().refresh(active);
    await ipc().agent.input({ sessionId: active, text: `${t}\r` });
  },

  pushUserEvent(sessionId, text) {
    const evt: ContextEvent = { kind: "user_input", text, ts: Date.now() };
    set((s) => {
      const existing = s.sessions[sessionId];
      if (!existing) return s;
      return {
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...existing,
            events: [...existing.events, evt].slice(-200),
          },
        },
      };
    });
  },

  getActive() {
    const { activeId, sessions } = get();
    return activeId ? sessions[activeId] ?? null : null;
  },

  getActiveState() {
    return get().getActive()?.session.state ?? "idle";
  },
}));
