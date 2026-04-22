import type { Card } from "@idex/types";

/**
 * Live X (Twitter) search via v2 API.
 *
 * Requires a Bearer Token with `tweet.read` scope. If `token` is empty,
 * the function returns `[]` immediately — no network call, no noise in
 * devtools. The user wires their token in Settings and every subsequent
 * curator run starts pulling real X posts.
 *
 * Endpoint: `GET /2/tweets/search/recent`
 * Docs:    https://developer.x.com/en/docs/x-api/tweets/search/api-reference/get-tweets-search-recent
 */
interface XSearchResponse {
  data?: XTweet[];
  includes?: { users?: XUser[]; media?: XMedia[] };
  errors?: { title: string; detail?: string }[];
}

interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  attachments?: { media_keys?: string[] };
}

interface XUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
}

const BASE = "https://api.x.com/2/tweets/search/recent";

export async function searchX(
  query: string,
  token: string,
  count = 20,
): Promise<Card[]> {
  const q = query.trim();
  if (!q || !token) return [];

  // Real X query. Multi-word queries → phrase match, so "claude code
  // skills" returns tweets that contain that exact phrase instead of
  // the wide AND-of-tokens which swamps the result set with irrelevant
  // single-word matches. Single-word queries pass through unquoted.
  // Drop retweets and replies, English only — echoes and thread noise
  // dilute the signal.
  const terms = q.split(/\s+/).filter(Boolean);
  const phraseQuery = terms.length > 1 ? `"${q}"` : q;
  const fullQuery = `${phraseQuery} -is:retweet -is:reply lang:en`;
  const url =
    `${BASE}?query=${encodeURIComponent(fullQuery)}` +
    `&max_results=${Math.min(Math.max(count, 10), 100)}` +
    `&tweet.fields=${encodeURIComponent("id,text,author_id,created_at,public_metrics,attachments")}` +
    `&expansions=${encodeURIComponent("author_id,attachments.media_keys")}` +
    `&user.fields=${encodeURIComponent("id,username,name,profile_image_url")}` +
    `&media.fields=${encodeURIComponent("media_key,type,url,preview_image_url,width,height")}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as XSearchResponse;
    if (body.errors?.length || !body.data?.length) return [];

    const users = new Map<string, XUser>();
    for (const u of body.includes?.users ?? []) users.set(u.id, u);
    const media = new Map<string, XMedia>();
    for (const m of body.includes?.media ?? []) media.set(m.media_key, m);

    return body.data.map((t) => tweetToCard(t, users, media, q));
  } catch {
    return [];
  }
}

function tweetToCard(
  t: XTweet,
  users: Map<string, XUser>,
  media: Map<string, XMedia>,
  query: string,
): Card {
  const u = users.get(t.author_id);
  const pm = t.public_metrics ?? {
    retweet_count: 0,
    reply_count: 0,
    like_count: 0,
    quote_count: 0,
  };

  // log-scaled engagement + recency boost (last week). Caps at 1.
  const engagement = pm.like_count + pm.retweet_count * 2 + pm.reply_count;
  const ageHours = (Date.now() - new Date(t.created_at).getTime()) / 3_600_000;
  const recencyBoost = Math.max(0, 1 - ageHours / (24 * 7));
  const score = Math.min(
    1,
    0.3 + Math.log10(engagement + 10) / 6 + recencyBoost * 0.15,
  );

  const mediaKey = t.attachments?.media_keys?.[0];
  const m = mediaKey ? media.get(mediaKey) : undefined;
  const imageUrl = m?.url ?? m?.preview_image_url;

  const name = u?.name ?? "Anonymous";
  const handle = u?.username ? `@${u.username}` : "@unknown";
  const link = `https://x.com/${u?.username ?? "i"}/status/${t.id}`;

  return {
    id: `x-${t.id}`,
    source: "x",
    url: link,
    oembed: null,
    fallback: {
      text: t.text,
      author: { name, handle, avatarUrl: u?.profile_image_url },
      createdAt: t.created_at,
      media: imageUrl
        ? [
            {
              kind: "image",
              url: imageUrl,
              alt: `Image by ${handle}`,
              width: m?.width,
              height: m?.height,
            },
          ]
        : [],
    },
    relevanceReason: `X match for "${query}"`,
    score,
    fetchedAt: Date.now(),
  };
}
