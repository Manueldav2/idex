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
  /**
   * Wall-clock of the last time the user actively engaged with the feed
   * (clicked a card, scrolled, toggled expand manually). Used to guard the
   * auto-collapse so that a just-finished agent doesn't yank the surface
   * away mid-read — if the user has touched the feed in the last
   * MIN_DWELL_MS we postpone the collapse.
   */
  lastInteractionTs: number;
  bindToAgent: () => () => void;
  refresh: (sessionId?: string) => void;
  setState: (state: FeedState) => void;
  /** Call whenever the user visibly interacts with the feed surface. */
  touch: () => void;
  /** Phase 2 telemetry hook — records explicit card interactions. */
  recordInteraction: (cardId: string, action: TelemetryAction) => void;
}

// Monotonic request counter outside the store — used to de-dupe stale
// curateLive() resolutions when refresh() is called rapidly.
let _liveReqCounter = 0;

/**
 * Minimum time the feed stays expanded after a user interaction before it
 * will honor an auto-collapse-on-done. Prevents the surface from being
 * yanked away mid-scroll when Claude happens to finish at exactly the
 * wrong moment. If the dwell hasn't passed yet, we set a single timer
 * that fires the collapse at the boundary instead.
 */
const MIN_DWELL_MS = 1200;
let _pendingCollapseTimer: ReturnType<typeof setTimeout> | null = null;

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

export const useFeed = create<FeedStore>((set, get) => ({
  state: "peek",
  cards: [],
  generation: 0,
  isLoading: false,
  topics: [],
  intent: null,
  lastInteractionTs: 0,

  bindToAgent() {
    /**
     * Schedule a collapse back to peek. Re-checks the dwell on each tick
     * so that ongoing clicks/scrolls keep the feed open — the collapse
     * only lands once the user has been still for MIN_DWELL_MS.
     */
    const scheduleCollapse = () => {
      if (_pendingCollapseTimer) clearTimeout(_pendingCollapseTimer);
      const tick = () => {
        if (get().state !== "expanded") {
          _pendingCollapseTimer = null;
          return;
        }
        const dwell = Date.now() - get().lastInteractionTs;
        if (dwell < MIN_DWELL_MS) {
          _pendingCollapseTimer = setTimeout(tick, MIN_DWELL_MS - dwell + 30);
          return;
        }
        _pendingCollapseTimer = null;
        set({ state: "peek" });
      };
      tick();
    };

    const unsub = useAgent.subscribe((store, prev) => {
      const activeId = store.activeId;
      if (!activeId) return;
      const current = store.sessions[activeId]?.session.state;
      const before = prev.sessions[activeId]?.session.state;
      // Core loop: when Claude finishes, the feed cedes the stage back
      // to the agent. This is the "phone rings, you hang up, you go
      // back to your conversation" moment the whole product is built
      // around. Only fire on the actual transition.
      if (current === "done" && before !== "done") scheduleCollapse();
      if (current === "error" && before !== "error") scheduleCollapse();
    });
    return () => {
      unsub();
      if (_pendingCollapseTimer) {
        clearTimeout(_pendingCollapseTimer);
        _pendingCollapseTimer = null;
      }
    };
  },

  touch() {
    set({ lastInteractionTs: Date.now() });
  },

  refresh(sessionId) {
    const activeId = sessionId ?? useAgent.getState().activeId;
    const session = activeId ? useAgent.getState().sessions[activeId] : null;
    const events = session?.events.slice(-12) ?? [];

    // The workspace folder name gives the curator an extra signal — e.g.
    // a workspace called "nova-ai-dashboard" strongly suggests the user
    // is working on an AI product even if the first prompt is vague.
    const workspacePath = useSettings.getState().config.workspacePath ?? null;
    const projectHint = workspacePath
      ? workspacePath.split("/").filter(Boolean).slice(-1)[0] ?? null
      : null;
    const curatorInput = { recentEvents: events, projectHint: projectHint ?? undefined };
    const curatorOn = useSettings.getState().config.curatorEnabled;

    // Extract plan topics synchronously for the peek-strip label, even while
    // the async curate runs.
    const plan = planFromContext(curatorInput);
    const topics = [...plan.directTopics, ...plan.adjacentTopics].slice(0, 6);

    // Decide whether to show starter cards as the interstitial.
    //
    // Before: we always flashed 18 starter-seed cards immediately while
    // the live fetch ran. That meant a user who asked "find me Claude
    // Code skills" briefly saw unrelated generic-dev-topic seeds before
    // real HN/Reddit/Bluesky results landed. That's the "random Anthropic
    // stuff" artifact — starter cards masquerading as curated content.
    //
    // Now: if the user has actually typed a prompt, skip the starter
    // interlude entirely and show the reading-the-room loading state.
    // Starter cards still power the true first-open state (no prompts
    // yet, ambient dev feed is genuinely what the user wants).
    const hasUserPrompt = events.some((e) => e.kind === "user_input");
    const interstitialCards = hasUserPrompt ? [] : curate(curatorInput).cards;
    set((s) => ({
      cards: interstitialCards,
      generation: s.generation + 1,
      isLoading: curatorOn,
      topics,
      intent: plan.intent,
    }));

    if (!curatorOn) return;

    const myReq = ++_liveReqCounter;
    // Two paths coexist: the new agent-driven planner (Gemini Flash via
    // OpenRouter, direct X via bearer token) and the Phase 2 Composio
    // flow (GLM-4.6 + Composio X). curateLive accepts both — direct
    // tokens win when set, Composio credentials cover the rest.
    const xBearerToken = useSettings.getState().config.xBearerToken;
    void (async () => {
      let openRouterKey: string | null = null;
      try {
        openRouterKey = await ipc().keychain.get("openrouter-api-key");
      } catch { /* ignore — falls back to naive plan */ }
      const credentials = await readCredentials();
      try {
        const { cards, plan: livePlan } = await curateLive(curatorInput, {
          xBearerToken,
          openRouterKey,
          credentials,
        });
        if (myReq !== _liveReqCounter) return;
        set((s) => ({
          cards,
          generation: s.generation + 1,
          isLoading: false,
          topics: [...livePlan.directTopics, ...livePlan.adjacentTopics].slice(0, 6),
          intent: livePlan.intent,
        }));
        // Fire-and-forget impression telemetry. No-ops when not opted in.
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
    // Any time state is set (user toggling expand/collapse, a
    // programmatic expand from sendToActive, etc.) we count it as an
    // interaction so the dwell-guarded auto-collapse doesn't fire
    // instantly after the user manually re-opens the feed.
    set({ state, lastInteractionTs: Date.now() });
    if (state === "peek" && _pendingCollapseTimer) {
      clearTimeout(_pendingCollapseTimer);
      _pendingCollapseTimer = null;
    }
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
