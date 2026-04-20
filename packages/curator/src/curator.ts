import type { Card, ContextEvent } from "@idex/types";
import type { CuratorInput, CuratorPlan } from "./types.js";
import { getStarterCards } from "./starter-feed.js";

/**
 * Naïve keyword extractor — used when no LLM is configured (v1.0 default mode).
 * Phase 2 swaps this for a single GLM-4.6 structured-output call.
 */
const STOP_WORDS = new Set([
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  "let","make","build","fix","help","need","want","please","try","then",
  "code","app","page","file","line","why","how","what","where","when","who",
]);

function naiveTopics(events: ContextEvent[], maxTopics = 8): string[] {
  const text = events
    .filter((e) => e.kind === "user_input" || e.kind === "agent_done")
    .map((e) => ("text" in e ? e.text : ""))
    .join(" ")
    .toLowerCase();

  const tokens = text.match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const tok of tokens) {
    if (STOP_WORDS.has(tok)) continue;
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([tok]) => tok);
}

/**
 * Build a plan from a batch of context events.
 * v1.0: deterministic keyword extraction, no LLM call.
 * Phase 2: this is replaced by a single GLM-4.6 structured-output call.
 */
export function planFromContext(input: CuratorInput): CuratorPlan {
  const topics = naiveTopics(input.recentEvents);
  const lastUserPrompt =
    [...input.recentEvents].reverse().find((e) => e.kind === "user_input");
  const intent = lastUserPrompt && "text" in lastUserPrompt
    ? lastUserPrompt.text.slice(0, 240)
    : "exploring code";

  return {
    summary: input.projectHint
      ? `Working in ${input.projectHint}`
      : `Working on: ${intent}`,
    intent,
    directTopics: topics.slice(0, 4),
    adjacentTopics: topics.slice(4),
    xQueries: topics.slice(0, 4).map((t) => t),
  };
}

/**
 * Curate a feed for a given context.
 * v1.0 implementation — returns starter cards re-ranked by topic overlap.
 *
 * Phase 2: planFromContext → Composio search → dedupe + rank → push.
 * If the real curator is unavailable, callers should fall back to this function.
 */
export function curate(input: CuratorInput): { plan: CuratorPlan; cards: Card[] } {
  const plan = planFromContext(input);
  const cards = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 12,
  });
  return { plan, cards };
}
