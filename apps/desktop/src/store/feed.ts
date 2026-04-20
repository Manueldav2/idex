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

// Monotonic request counter outside the store — used to de-dupe stale
// curateLive() resolutions when refresh() is called rapidly (Enter spam).
// The last refresh wins; earlier resolutions are ignored.
let _liveReqCounter = 0;

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

    // Request ID is captured BEFORE the async kicks off; when it resolves
    // we check that no newer request has started (race-safe).
    const myReq = ++_liveReqCounter;
    void curateLive({ recentEvents: events }).then(({ cards }) => {
      if (myReq !== _liveReqCounter) return; // stale
      set((s) => ({
        cards,
        generation: s.generation + 1,
        isLoading: false,
      }));
    }).catch(() => {
      if (myReq !== _liveReqCounter) return;
      set({ isLoading: false });
    });
  },

  setState(state) {
    set({ state });
  },
}));
