import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { KEYCHAIN_KEY } from "@idex/types";
import {
  curate,
  curateLive,
  hashTopics,
  planFromContext,
  sendTelemetry,
  type CuratorCredentials,
  type TelemetryAction,
} from "@idex/curator";
import { ipc } from "@/lib/ipc";
import { useAgent } from "./agent";
import { useSettings } from "./settings";

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
  recordInteraction: (cardId: string, action: TelemetryAction) => void;
}

// Monotonic request counter outside the store — used to de-dupe stale
// curateLive() resolutions when refresh() is called rapidly.
let _liveReqCounter = 0;

// Remembers which cardIds we've already emitted a "shown" event for so we
// don't double-count when the same batch re-renders.
const _seenCardIds = new Set<string>();

/**
 * Read the user's curator credentials from the Electron main process.
 * Every call reads fresh from the keychain so a settings change is picked
 * up on the next refresh without any explicit invalidation.
 */
async function readCredentials(): Promise<CuratorCredentials> {
  const [openrouter, composioKey] = await Promise.all([
    ipc().keychain.get(KEYCHAIN_KEY.OPENROUTER_API_KEY),
    ipc().keychain.get(KEYCHAIN_KEY.COMPOSIO_API_KEY),
  ]);
  const config = useSettings.getState().config;
  return {
    openrouterApiKey: openrouter,
    composioApiKey: composioKey,
    composioConnectedAccountId: config.composioConnectedAccountId,
  };
}

export const useFeed = create<FeedStore>((set) => ({
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

    const curatorOn = useSettings.getState().config.curatorEnabled;

    // Extract plan topics synchronously for the peek-strip label, even while
    // the async curate runs.
    const plan = planFromContext({ recentEvents: events });
    const topics = [...plan.directTopics, ...plan.adjacentTopics].slice(0, 6);

    // Immediate synchronous starter-based cards.
    const { cards: quickCards } = curate({ recentEvents: events });
    set((s) => ({
      cards: quickCards,
      generation: s.generation + 1,
      isLoading: curatorOn,
      topics,
      intent: plan.intent,
    }));

    if (!curatorOn) return;

    const myReq = ++_liveReqCounter;
    void (async () => {
      try {
        const credentials = await readCredentials();
        const { cards, plan: livePlan } = await curateLive(
          { recentEvents: events },
          { credentials },
        );
        if (myReq !== _liveReqCounter) return;
        set((s) => ({
          cards,
          generation: s.generation + 1,
          isLoading: false,
          topics: [...livePlan.directTopics, ...livePlan.adjacentTopics].slice(0, 6),
          intent: livePlan.intent,
        }));

        // Fire-and-forget impression telemetry. No-ops when the user has
        // not opted in. `hashTopics` is cheap and ensures no raw topic
        // text leaves the machine.
        const { curatorTelemetryEnabled } = useSettings.getState().config;
        if (curatorTelemetryEnabled) {
          const topicHash = await hashTopics([
            ...livePlan.directTopics,
            ...livePlan.adjacentTopics,
          ]);
          for (const card of cards) {
            if (_seenCardIds.has(card.id)) continue;
            _seenCardIds.add(card.id);
            void sendTelemetry(
              {
                cardId: card.id,
                topicHash,
                action: "shown",
                source: card.source,
                ts: Date.now(),
              },
              { enabled: true },
            );
          }
        }
      } catch {
        if (myReq !== _liveReqCounter) return;
        set({ isLoading: false });
      }
    })();
  },

  setState(state) {
    set({ state });
  },

  recordInteraction(cardId, action) {
    // Explicit user action on a card (thumbs up/down, opened). Reuses the
    // current topic list so the backend can correlate engagement back to
    // a plan without ever seeing the plan text itself.
    const { curatorTelemetryEnabled } = useSettings.getState().config;
    if (!curatorTelemetryEnabled) return;
    const topics = useFeed.getState().topics;
    const source =
      useFeed.getState().cards.find((c) => c.id === cardId)?.source ?? "unknown";
    void (async () => {
      const topicHash = await hashTopics(topics);
      void sendTelemetry(
        { cardId, topicHash, action, source, ts: Date.now() },
        { enabled: true },
      );
    })();
  },
}));
