import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { curate } from "@idex/curator";
import { useAgent } from "./agent";

interface FeedStore {
  state: FeedState;
  cards: Card[];
  generation: number;
  /** Bind to agent state to drive peek↔expanded transitions. */
  bindToAgent: () => () => void;
  /** Refresh cards based on the current agent context. */
  refresh: () => void;
  setState: (state: FeedState) => void;
}

export const useFeed = create<FeedStore>((set, get) => ({
  state: "peek",
  cards: [],
  generation: 0,

  bindToAgent() {
    const unsub = useAgent.subscribe((agentStore, prev) => {
      if (agentStore.state === "generating" && prev.state !== "generating") {
        set({ state: "expanded" });
        get().refresh();
      } else if (agentStore.state === "done" && prev.state !== "done") {
        set({ state: "peek" });
      }
    });
    return unsub;
  },

  refresh() {
    const events = useAgent.getState().events;
    const { cards } = curate({ recentEvents: events.slice(-12) });
    set((s) => ({ cards, generation: s.generation + 1 }));
  },

  setState(state) {
    set({ state });
  },
}));
