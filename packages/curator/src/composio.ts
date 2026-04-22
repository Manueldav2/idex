/**
 * Composio REST client — executes `TWITTER_SEARCH_TWEETS` against a user's
 * connected X account and maps the result into our `Card` shape.
 *
 * Composio exposes a unified action API: we POST a JSON `arguments` object
 * to `/actions/TWITTER_SEARCH_TWEETS/execute` along with the connected
 * account id and get back whatever the underlying X API returned.
 *
 * A few notes on resilience:
 *   - Rate limit: token bucket per connected account (300 tokens / 15 min,
 *     matches X's read-tier cap for most apps).
 *   - Cache: in-memory stale-while-revalidate keyed on `${accountId}::${q}`
 *     with a 15-minute TTL. This stops repeat prompts from burning tokens.
 *   - Aborts via `AbortSignal.timeout(8_000)` — any single call is
 *     capped so the feed pane doesn't hang.
 */
import type { Card, OEmbedPayload } from "@idex/types";

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";
const DEFAULT_TIMEOUT_MS = 8_000;

const RATE_LIMIT = {
  capacity: 300,
  /** ms per full refill. Matches X's read-tier 15-min window. */
  refillMs: 15 * 60 * 1000,
};

const CACHE_TTL_MS = 15 * 60 * 1000;

interface RateBucket {
  tokens: number;
  updatedAt: number;
}
const buckets = new Map<string, RateBucket>();

interface CacheEntry {
  cards: Card[];
  at: number;
}
const cache = new Map<string, CacheEntry>();

export interface SearchTweetsOptions {
  apiKey: string;
  connectedAccountId: string;
  query: string;
  maxResults?: number;
  baseUrl?: string;
  timeoutMs?: number;
  /**
   * When true, bypass both the rate limiter and the cache. Used by tests
   * and by the Settings panel's "Refresh now" affordance.
   */
  bypassRateLimit?: boolean;
}

/**
 * Shape of a Composio execute response. The `data` bag is whatever the
 * tool returned; we defensive-shape it rather than trusting every field.
 */
interface ComposioExecuteResponse {
  successful?: boolean;
  data?: {
    data?: ComposioTweet[];
    includes?: {
      users?: ComposioUser[];
      media?: ComposioMedia[];
    };
  };
  error?: string | null;
}

interface ComposioTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  entities?: unknown;
  attachments?: { media_keys?: string[] };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
  /** Present when Composio resolves the oEmbed payload for us. */
  oembed?: {
    html?: string;
    width?: number;
    height?: number;
  };
}

interface ComposioUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

interface ComposioMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
  width?: number;
  height?: number;
}

/**
 * Execute `TWITTER_SEARCH_TWEETS` for a connected account and return
 * ranked `Card`s. Returns `[]` on any failure — callers are expected to
 * fall back to another source (HN, Reddit, starter feed).
 */
export async function searchTweets(opts: SearchTweetsOptions): Promise<Card[]> {
  const {
    apiKey,
    connectedAccountId,
    query,
    maxResults = 10,
    baseUrl = COMPOSIO_BASE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bypassRateLimit = false,
  } = opts;

  if (!apiKey || !connectedAccountId || !query.trim()) return [];

  const cacheKey = `${connectedAccountId}::${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.cards;
  }

  if (!bypassRateLimit && !take(connectedAccountId)) {
    // Rate-limited. Prefer stale cache over empty if we have anything.
    return cached?.cards ?? [];
  }

  try {
    const res = await fetch(`${baseUrl}/actions/TWITTER_SEARCH_TWEETS/execute`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        connectedAccountId,
        input: {
          query,
          max_results: Math.max(10, Math.min(50, maxResults)),
          "tweet.fields": "created_at,public_metrics,entities,attachments",
          "user.fields": "username,name,profile_image_url",
          "media.fields": "url,preview_image_url,alt_text,width,height,type",
          expansions: "author_id,attachments.media_keys",
        },
      }),
    });

    if (!res.ok) return cached?.cards ?? [];
    const body = (await res.json()) as ComposioExecuteResponse;
    if (body.successful === false) return cached?.cards ?? [];

    const cards = toCards(body, query);
    cache.set(cacheKey, { cards, at: now });
    return cards;
  } catch {
    return cached?.cards ?? [];
  }
}

/**
 * Convert Composio's X response payload to our `Card[]` shape. Resolves
 * author + media via the `includes` hash so the final card is
 * self-contained.
 */
function toCards(body: ComposioExecuteResponse, query: string): Card[] {
  const tweets = body.data?.data ?? [];
  const users = new Map<string, ComposioUser>();
  for (const u of body.data?.includes?.users ?? []) users.set(u.id, u);
  const media = new Map<string, ComposioMedia>();
  for (const m of body.data?.includes?.media ?? []) media.set(m.media_key, m);

  const now = Date.now();
  return tweets.map((t) => {
    const author = t.author_id ? users.get(t.author_id) : undefined;
    const likes = t.public_metrics?.like_count ?? 0;
    const score = Math.min(1, 0.35 + likes / 800);
    const url = author
      ? `https://twitter.com/${author.username}/status/${t.id}`
      : `https://twitter.com/i/web/status/${t.id}`;

    const attached = (t.attachments?.media_keys ?? [])
      .map((k) => media.get(k))
      .filter((m): m is ComposioMedia => !!m);

    const oembed: OEmbedPayload | null = t.oembed?.html
      ? {
          html: t.oembed.html,
          width: t.oembed.width,
          height: t.oembed.height,
        }
      : null;

    return {
      id: `tw-${t.id}`,
      source: "twitter",
      url,
      oembed,
      fallback: {
        text: t.text,
        media: attached.map((m) => ({
          kind: m.type === "photo" ? "image" : "video",
          url: m.url ?? m.preview_image_url ?? "",
          alt: m.alt_text,
          width: m.width,
          height: m.height,
        })),
        author: {
          name: author?.name ?? "Unknown",
          handle: author?.username ?? "unknown",
          avatarUrl: author?.profile_image_url,
        },
        createdAt: t.created_at ?? new Date(now).toISOString(),
      },
      relevanceReason: `X match for "${query}"`,
      score,
      fetchedAt: now,
    } satisfies Card;
  });
}

/**
 * Token bucket — consume one token; refill linearly. Returns false if
 * the caller should back off.
 */
function take(accountId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(accountId) ?? {
    tokens: RATE_LIMIT.capacity,
    updatedAt: now,
  };
  const elapsed = now - bucket.updatedAt;
  const refilled = Math.min(
    RATE_LIMIT.capacity,
    bucket.tokens + (elapsed / RATE_LIMIT.refillMs) * RATE_LIMIT.capacity,
  );
  if (refilled < 1) {
    bucket.tokens = refilled;
    bucket.updatedAt = now;
    buckets.set(accountId, bucket);
    return false;
  }
  bucket.tokens = refilled - 1;
  bucket.updatedAt = now;
  buckets.set(accountId, bucket);
  return true;
}

/* ─── OAuth flow helpers ─── */

export interface InitiateConnectionOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Composio auth-config id for the X integration (one per workspace). */
  authConfigId: string;
  /** Optional stable user identifier so repeat connects reuse the row. */
  userId?: string;
}

export interface InitiateConnectionResult {
  connectedAccountId: string;
  redirectUrl: string;
}

/**
 * Kick off a Composio "connected account" and return the OAuth consent
 * URL for the user to visit. Caller opens the URL in the OS browser.
 */
export async function initiateConnection(
  opts: InitiateConnectionOptions,
): Promise<InitiateConnectionResult> {
  const {
    apiKey,
    baseUrl = COMPOSIO_BASE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    authConfigId,
    userId,
  } = opts;

  const res = await fetch(`${baseUrl}/connected_accounts`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      auth_config: { id: authConfigId },
      connection: {
        user_id: userId ?? "idex-user",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`composio: initiate ${res.status}`);
  }
  const body = (await res.json()) as {
    id: string;
    connectionData?: { redirectUrl?: string; redirect_url?: string };
    redirectUrl?: string;
    redirect_url?: string;
  };
  const redirect =
    body.connectionData?.redirectUrl ??
    body.connectionData?.redirect_url ??
    body.redirectUrl ??
    body.redirect_url;
  if (!body.id || !redirect) {
    throw new Error("composio: initiate response missing id or redirectUrl");
  }
  return { connectedAccountId: body.id, redirectUrl: redirect };
}

export type ComposioStatus = "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "UNKNOWN";

/**
 * Poll connection status. Returns the current state — caller decides
 * whether to keep polling.
 */
export async function getConnectionStatus(opts: {
  apiKey: string;
  connectedAccountId: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<ComposioStatus> {
  const {
    apiKey,
    connectedAccountId,
    baseUrl = COMPOSIO_BASE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  try {
    const res = await fetch(`${baseUrl}/connected_accounts/${connectedAccountId}`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return "UNKNOWN";
    const body = (await res.json()) as { status?: string };
    const s = (body.status ?? "UNKNOWN").toUpperCase();
    if (s === "ACTIVE" || s === "INITIATED" || s === "FAILED" || s === "EXPIRED") {
      return s;
    }
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** Test-only helper — drops all internal state. */
export function __resetComposioState() {
  buckets.clear();
  cache.clear();
}
