import type { Card } from "@idex/types";

interface RedditChild {
  data: {
    id: string;
    title: string;
    author: string;
    subreddit: string;
    permalink: string;
    url_overridden_by_dest?: string;
    selftext: string;
    score: number;
    num_comments: number;
    created_utc: number;
    thumbnail?: string;
    preview?: {
      images?: Array<{ source?: { url?: string } }>;
    };
  };
}

interface RedditResp {
  data: { children: RedditChild[] };
}

/**
 * Search Reddit's programming-adjacent subs via the public JSON API.
 * No auth. Results aren't sorted for dev-relevance so we bias toward
 * /r/programming, /r/webdev, /r/MachineLearning.
 */
const SUBREDDITS = ["programming", "webdev", "MachineLearning", "reactjs", "javascript"];

export async function searchReddit(query: string, count = 6): Promise<Card[]> {
  if (!query.trim()) return [];
  const sub = SUBREDDITS.join("+");
  const url =
    `https://www.reddit.com/r/${sub}/search.json` +
    `?q=${encodeURIComponent(query)}&sort=relevance&limit=${count}&restrict_sr=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "IDEX/0.1 (contextual feed)" },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as RedditResp;
    return body.data.children.map((c) => redditToCard(c.data, query));
  } catch {
    return [];
  }
}

function redditToCard(d: RedditChild["data"], query: string): Card {
  const imgSource = d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&");
  return {
    id: `rd-${d.id}`,
    source: "reddit",
    url: `https://www.reddit.com${d.permalink}`,
    oembed: null,
    fallback: {
      text: d.title,
      media: imgSource
        ? [{ kind: "image", url: imgSource }]
        : [],
      author: {
        name: d.author,
        handle: `r/${d.subreddit} · ${d.score} pts`,
      },
      createdAt: new Date(d.created_utc * 1000).toISOString(),
    },
    relevanceReason: `Reddit r/${d.subreddit} on "${query}"`,
    score: Math.min(1, 0.3 + d.score / 1000),
    fetchedAt: Date.now(),
  };
}
