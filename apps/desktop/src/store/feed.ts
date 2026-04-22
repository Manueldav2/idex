import { create } from "zustand";
import type { Card, FeedState } from "@idex/types";
import { curate, curateLive, planFromContext } from "@idex/curator";
import { useAgent } from "./agent";
import { useSettings } from "./settings";
import { ipc } from "@/lib/ipc";

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
      isLoading: true,
      topics,
      intent: plan.intent,
    }));

    const myReq = ++_liveReqCounter;
    // Read secrets at call time, not subscribe time — user can paste
    // a token into Settings mid-session and the next refresh picks it
    // up without reload. Key lives in the OS keychain; fetch is async
    // so we capture whatever is resolved before firing the curator.
    const xBearerToken = useSettings.getState().config.xBearerToken;
    void (async () => {
      let openRouterKey: string | null = null;
      try {
        openRouterKey = await ipc().keychain.get("openrouter-api-key");
      } catch { /* ignore — falls back to naive plan */ }
      return curateLive(curatorInput, { xBearerToken, openRouterKey });
    })().then(({ cards }) => {
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
}));
