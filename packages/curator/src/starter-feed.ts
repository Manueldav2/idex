import type { Card } from "@idex/types";

interface StarterFeedRaw {
  version: 1;
  generatedAt: string;
  cards: Array<{
    id: string;
    topics: string[];
    url: string;
    fallback: NonNullable<Card["fallback"]>;
    relevanceReason: string;
  }>;
}

import starterFeedJson from "./starter-feed.json" with { type: "json" };

const starter = starterFeedJson as StarterFeedRaw;

/**
 * Score a starter card against an arbitrary set of topic strings.
 * Simple keyword overlap weighted by topic length (longer topics weighted higher).
 */
function scoreCard(cardTopics: string[], queryTopics: string[]): number {
  if (queryTopics.length === 0) return 0.4; // baseline so cards still flow
  const lcQuery = queryTopics.map((t) => t.toLowerCase());
  let hits = 0;
  for (const cardTopic of cardTopics) {
    const lc = cardTopic.toLowerCase();
    for (const q of lcQuery) {
      if (lc.includes(q) || q.includes(lc)) {
        hits += Math.min(lc.length, q.length) / 16;
      }
    }
  }
  return Math.min(1, hits / cardTopics.length + 0.2);
}

/**
 * Pull a ranked starter feed for the given topic hints.
 * Used as the no-API-keys default and as the fallback when the
 * real curator (Phase 2) is offline or hasn't returned in time.
 */
export function getStarterCards(opts: {
  topics?: string[];
  count?: number;
} = {}): Card[] {
  const queryTopics = opts.topics ?? [];
  const count = opts.count ?? 12;
  const now = Date.now();

  const ranked = starter.cards
    .map((raw) => {
      const score = scoreCard(raw.topics, queryTopics);
      const card: Card = {
        id: raw.id,
        source: "starter",
        url: raw.url,
        oembed: null,
        fallback: raw.fallback,
        relevanceReason: raw.relevanceReason,
        score,
        fetchedAt: now,
      };
      return card;
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, count);
}
