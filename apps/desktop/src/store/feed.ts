import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { curate, curateLive } from "@idex/curator";
import { useAgent } from "./agent";

interface FeedStore {
  state: FeedState;
  cards: Card[];
  generation: number;
  isLoading: boolean;
  bindToAgent: () => () => void;
  refresh: (sessionId?: string) => void;
  setState: (state: FeedState) => void;
}

export const useFeed = create<FeedStore>((set, get) => ({
  state: "peek",
  cards: [],
  generation: 0,
  isLoading: false,

  bindToAgent() {
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

    // Immediate synchronous starter-based cards so the feed never looks empty.
    const { cards: quickCards } = curate({ recentEvents: events });
    set((s) => ({
      cards: quickCards,
      generation: s.generation + 1,
      isLoading: true,
    }));

    // Kick off the async live fetch (HN + Reddit) and replace cards when ready.
    const thisGen = get().generation + 1;
    void curateLive({ recentEvents: events }).then(({ cards }) => {
      // Only apply if no newer refresh has happened in the meantime
      if (get().generation > thisGen) return;
      set((s) => ({
        cards,
        generation: s.generation + 1,
        isLoading: false,
      }));
    }).catch(() => {
      set({ isLoading: false });
    });
  },

  setState(state) {
    set({ state });
  },
}));
