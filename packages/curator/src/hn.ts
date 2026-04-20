import type { Card } from "@idex/types";

interface HNHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  created_at: string;
  points: number | null;
  num_comments: number | null;
  story_text: string | null;
  _tags?: string[];
}

interface HNResponse {
  hits: HNHit[];
  nbHits: number;
}

const BASE = "https://hn.algolia.com/api/v1/search";

/**
 * Search Hacker News via Algolia. Public, no auth, no rate-limit worth
 * worrying about. Good default feed source while the real X integration
 * is wired up.
 */
export async function searchHackerNews(query: string, count = 8): Promise<Card[]> {
  if (!query.trim()) return [];
  const url =
    `${BASE}?query=${encodeURIComponent(query)}` +
    `&tags=story&hitsPerPage=${count}`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const body = (await res.json()) as HNResponse;
    return body.hits
      .filter((h) => h.title)
      .map((h) => hnToCard(h, query));
  } catch {
    return [];
  }
}

function hnToCard(h: HNHit, query: string): Card {
  const maxPoints = 500;
  const score = Math.min(1, 0.35 + (h.points ?? 0) / maxPoints);
  const link = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
  return {
    id: `hn-${h.objectID}`,
    source: "hackernews",
    url: link,
    oembed: null,
    fallback: {
      text: h.title ?? "",
      media: [],
      author: {
        name: h.author,
        handle: `HN · ${h.points ?? 0} pts · ${h.num_comments ?? 0} comments`,
      },
      createdAt: h.created_at,
    },
    relevanceReason: `Hacker News match for "${query}"`,
    score,
    fetchedAt: Date.now(),
  };
}
