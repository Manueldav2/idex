import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { curate, curateLive, planFromContext } from "@idex/curator";
import { useAgent } from "./agent";

interface FeedStore {
  state: FeedState;
  cards: Card[];
  generation: number;
  isLoading: boolean;
  /** Topics the curator is reading right now (used for the peek-strip label). */
  topics: string[];
  /** Short natural-language label of what the curator thinks the user is doing. */
  intent: string | null;
  bindToAgent: () => () => void;
  refresh: (sessionId?: string) => void;
  setState: (state: FeedState) => void;
}

// Monotonic request counter outside the store — used to de-dupe stale
// curateLive() resolutions when refresh() is called rapidly.
let _liveReqCounter = 0;

export const useFeed = create<FeedStore>((set, get) => ({
  state: "peek",
  cards: [],
  generation: 0,
  isLoading: false,
  topics: [],
  intent: null,

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

    // Extract plan topics synchronously for the peek-strip label, even while
    // the async curate runs.
    const plan = planFromContext({ recentEvents: events });
    const topics = [...plan.directTopics, ...plan.adjacentTopics].slice(0, 6);

    // Immediate synchronous starter-based cards.
    const { cards: quickCards } = curate({ recentEvents: events });
    set((s) => ({
      cards: quickCards,
      generation: s.generation + 1,
      isLoading: true,
      topics,
      intent: plan.intent,
    }));

    const myReq = ++_liveReqCounter;
    void curateLive({ recentEvents: events }).then(({ cards }) => {
      if (myReq !== _liveReqCounter) return;
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
