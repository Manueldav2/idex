import type { Card } from "@idex/types";

/**
 * Bluesky's public search endpoint — no auth, good dev content volume,
 * returns real posts with authors + engagement counts.
 * Docs: https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
 */
interface BskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface BskyEmbedImage {
  thumb?: string;
  fullsize?: string;
  alt?: string;
}

interface BskyPostRecord {
  text?: string;
  createdAt?: string;
}

interface BskyPost {
  uri: string;
  cid: string;
  author: BskyAuthor;
  record: BskyPostRecord;
  indexedAt: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  embed?: {
    images?: BskyEmbedImage[];
  };
}

interface BskySearchResp {
  posts: BskyPost[];
  cursor?: string;
}

// The correct no-auth public endpoint is api.bsky.app (not the
// public.api. subdomain, which returns 403 from most geos).
const BASE = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";

export async function searchBluesky(query: string, count = 10): Promise<Card[]> {
  if (!query.trim()) return [];
  const url = `${BASE}?q=${encodeURIComponent(query)}&limit=${count}&sort=top`;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as BskySearchResp;
    return body.posts.map((p) => bskyToCard(p, query));
  } catch {
    return [];
  }
}

function bskyToCard(p: BskyPost, query: string): Card {
  const likes = p.likeCount ?? 0;
  const score = Math.min(1, 0.35 + likes / 220);
  // Build the web URL: bsky.app/profile/<handle>/post/<rkey>
  const rkey = p.uri.split("/").pop() ?? "";
  const webUrl = `https://bsky.app/profile/${p.author.handle}/post/${rkey}`;
  const images = p.embed?.images
    ?.map((img) => ({
      kind: "image" as const,
      url: img.fullsize ?? img.thumb ?? "",
      alt: img.alt,
    }))
    .filter((m) => m.url.length > 0);
  return {
    id: `bsky-${p.cid}`,
    // Render as twitter-style — bluesky is the closest thing to real twitter UX.
    source: "twitter",
    url: webUrl,
    oembed: null,
    fallback: {
      text: p.record.text ?? "",
      media: images && images.length > 0 ? images : [],
      author: {
        name: p.author.displayName ?? p.author.handle,
        handle: p.author.handle,
        avatarUrl: p.author.avatar,
      },
      createdAt: p.record.createdAt ?? p.indexedAt,
    },
    relevanceReason: `Bluesky discussion on "${query}"`,
    score,
    fetchedAt: Date.now(),
  };
}
