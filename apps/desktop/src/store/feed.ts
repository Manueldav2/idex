import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { curate } from "@idex/curator";
import { useAgent } from "./agent";

interface FeedStore {
  state: FeedState;
  cards: Card[];
  generation: number;
  bindToAgent: () => () => void;
  refresh: (sessionId?: string) => void;
  setState: (state: FeedState) => void;
}

export const useFeed = create<FeedStore>((set, get) => ({
  state: "peek",
  cards: [],
  generation: 0,

  bindToAgent() {
    // Collapse when active session finishes. Expansion is triggered
    // explicitly from agent.sendToActive().
    const unsub = useAgent.subscribe((store, prev) => {
      const activeId = store.activeId;
      if (!activeId) return;
      const current = store.sessions[activeId]?.session.state;
      const before = prev.sessions[activeId]?.session.state;
      if (current === "done" && before !== "done") set({ state: "peek" });
      if (current === "error") set({ state: "peek" });
    });
    return unsub;
  },

  refresh(sessionId) {
    const activeId = sessionId ?? useAgent.getState().activeId;
    const session = activeId ? useAgent.getState().sessions[activeId] : null;
    const events = session?.events.slice(-12) ?? [];
    const { cards } = curate({ recentEvents: events });
    set((s) => ({ cards, generation: s.generation + 1 }));
  },

  setState(state) {
    set({ state });
  },
}));
