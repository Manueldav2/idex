import type { Card, ContextEvent } from "@idex/types";
import type { CuratorInput, CuratorPlan } from "./types.js";
import { getStarterCards } from "./starter-feed.js";
import { searchHackerNews } from "./hn.js";
import { searchReddit } from "./reddit.js";

const STOP_WORDS = new Set([
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  "let","make","build","fix","help","need","want","please","try","then",
  "code","app","page","file","line","why","how","what","where","when","who",
  "like","can","will","would","should","could","just","really","maybe",
  "thing","stuff","some","any","all","lots","more","most","less","same",
]);

function naiveTopics(events: ContextEvent[], maxTopics = 6): string[] {
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
    directTopics: topics.slice(0, 3),
    adjacentTopics: topics.slice(3),
    xQueries: topics.slice(0, 3),
  };
}

/**
 * Synchronous v1.0 curator — returns only starter-feed cards ranked by
 * topic overlap. Used as the immediate response while the async pass
 * fetches live content.
 */
export function curate(input: CuratorInput): { plan: CuratorPlan; cards: Card[] } {
  const plan = planFromContext(input);
  const cards = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 10,
  });
  return { plan, cards };
}

/**
 * Async curator — searches Hacker News and Reddit for topics extracted
 * from the user's prompts. Falls back to starter cards when the live
 * sources return nothing (e.g. offline, unusual topic).
 */
export async function curateLive(input: CuratorInput): Promise<{ plan: CuratorPlan; cards: Card[] }> {
  const plan = planFromContext(input);
  const fallback = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 6,
  });

  const queries = [...plan.directTopics, ...plan.adjacentTopics.slice(0, 2)]
    .filter((q) => q.length >= 3)
    .slice(0, 3);

  if (queries.length === 0) {
    return { plan, cards: fallback };
  }

  // Kick off live queries in parallel, race the slowest.
  const liveResults = await Promise.all(
    queries.flatMap((q) => [
      searchHackerNews(q, 5),
      searchReddit(q, 3),
    ]),
  );
  const live = liveResults.flat();

  // Dedupe by id (HN + Reddit can have overlapping topics on their own)
  const seen = new Set<string>();
  const liveUnique = live.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Rank: live cards first by score, then starter cards.
  liveUnique.sort((a, b) => b.score - a.score);
  const combined = [...liveUnique, ...fallback]
    .slice(0, 14);

  return { plan, cards: combined.length > 0 ? combined : fallback };
}
