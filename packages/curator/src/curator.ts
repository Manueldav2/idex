import type { Card, ContextEvent } from "@idex/types";
import type { CuratorInput, CuratorPlan } from "./types.js";
import { getStarterCards } from "./starter-feed.js";
import { searchHackerNews } from "./hn.js";
import { searchReddit } from "./reddit.js";
import { searchBluesky } from "./bluesky.js";
import { callGLM46 } from "./openrouter.js";
import { searchTweets } from "./composio.js";

const STOP_WORDS = new Set([
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  "let","make","build","fix","help","need","want","please","try","then",
  "code","app","page","file","line","why","how","what","where","when","who",
  "like","can","will","would","should","could","just","really","maybe",
  "thing","stuff","some","any","all","lots","more","most","less","same",
  "about","into","onto","over","under","than","also","here","there","now",
  "one","two","three","first","last","next","still","already","even","only",
]);

/** Default / ambient developer queries — used when the user's prompt hasn't
 *  given us much signal yet, so the feed still feels alive on first open. */
const DEFAULT_AMBIENT_TOPICS = [
  "typescript",
  "react",
  "claude",
  "developer tools",
  "design engineering",
];

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
    // Queries sent to the live sources: direct topics first, then 2-grams
    // of the top two topics (e.g. "typescript react") for more specificity.
    xQueries: topics.slice(0, 4),
  };
}

/**
 * Synchronous starter-feed curator — always returns something immediately
 * so the feed is never empty while the async pass runs.
 */
export function curate(input: CuratorInput): { plan: CuratorPlan; cards: Card[] } {
  const plan = planFromContext(input);
  const cards = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 18,
  });
  return { plan, cards };
}

/**
 * Build a compact transcript string from the recent event list. Trims to
 * the last ~8 turns so the prompt stays under the model's input budget.
 */
function buildTranscript(events: ContextEvent[]): string {
  const recent = events.slice(-8);
  const lines: string[] = [];
  for (const e of recent) {
    if (e.kind === "user_input" && "text" in e) {
      lines.push(`USER: ${e.text.slice(0, 600)}`);
    } else if (e.kind === "agent_done" && "text" in e) {
      lines.push(`AGENT: ${e.text.slice(0, 400)}`);
    }
  }
  return lines.join("\n");
}

export interface CuratorCredentials {
  /** OpenRouter API key. When absent, the curator skips the LLM step. */
  openrouterApiKey?: string | null;
  /** Composio API key. Required for X search. */
  composioApiKey?: string | null;
  /** Composio connected-account id for the user's X account. */
  composioConnectedAccountId?: string | null;
}

export interface CurateLiveOptions {
  /** Max cards in the final result set. Larger values = longer feel-real feed. */
  limit?: number;
  credentials?: CuratorCredentials;
}

/**
 * Async curator — searches X (via Composio) if connected, and always
 * pulls from Hacker News, Reddit, and Bluesky in parallel. When an
 * OpenRouter key is provided, GLM-4.6 generates the topic plan; otherwise
 * we fall back to deterministic keyword extraction.
 */
export async function curateLive(
  input: CuratorInput,
  opts: CurateLiveOptions = {},
): Promise<{ plan: CuratorPlan; cards: Card[] }> {
  const deterministic = planFromContext(input);
  const limit = opts.limit ?? 40;
  const creds = opts.credentials ?? {};

  let plan: CuratorPlan = deterministic;

  // Try GLM-4.6 for a smarter plan. Fail silently and keep the
  // deterministic plan on any error.
  if (creds.openrouterApiKey) {
    try {
      const conversation = buildTranscript(input.recentEvents);
      if (conversation.length > 0) {
        plan = await callGLM46({
          apiKey: creds.openrouterApiKey,
          conversation,
          projectHint: input.projectHint,
        });
      }
    } catch {
      plan = deterministic;
    }
  }

  // Starter feed always contributes as a backstop — ranked low so live hits
  // push it to the bottom of the feed.
  const fallback = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 8,
  });

  // Build a rich query set. If the curator plan gave us real signal, use
  // those topics. Otherwise, fall back to ambient dev topics so the feed is
  // immediately alive on first open.
  const rawTopics = [...plan.directTopics, ...plan.adjacentTopics]
    .filter((q) => q.length >= 3);

  const topics = rawTopics.length > 0 ? rawTopics : DEFAULT_AMBIENT_TOPICS;
  // Cap at 5 queries to keep parallel fetch count reasonable.
  const queries = topics.slice(0, 5);

  const xQueries = (plan.xQueries.length > 0 ? plan.xQueries : queries).slice(0, 4);

  // Sources run in parallel — each returns [] on failure. The live X pane
  // is gated on Composio creds; when missing, we skip it entirely.
  const hasX = Boolean(creds.composioApiKey && creds.composioConnectedAccountId);

  const fetches: Array<Promise<Card[]>> = [];
  for (const q of queries) {
    fetches.push(searchHackerNews(q, 6));
    fetches.push(searchReddit(q, 5));
    fetches.push(searchBluesky(q, 8));
  }
  if (hasX) {
    for (const q of xQueries) {
      fetches.push(
        searchTweets({
          apiKey: creds.composioApiKey!,
          connectedAccountId: creds.composioConnectedAccountId!,
          query: q,
          maxResults: 10,
        }),
      );
    }
  }

  const liveResults = await Promise.all(fetches);
  const live = liveResults.flat();

  // Dedupe by id.
  const seen = new Set<string>();
  const liveUnique = live.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Light source-balancing: interleave sources so the feed doesn't look
  // like 20 tweets followed by 20 HN items.
  const bySrc = new Map<Card["source"], Card[]>();
  for (const c of liveUnique) {
    const bucket = bySrc.get(c.source) ?? [];
    bucket.push(c);
    bySrc.set(c.source, bucket);
  }
  for (const bucket of bySrc.values()) bucket.sort((a, b) => b.score - a.score);
  const buckets = Array.from(bySrc.values());
  const interleaved: Card[] = [];
  let idx = 0;
  while (interleaved.length < liveUnique.length) {
    let anyTaken = false;
    for (const b of buckets) {
      const c = b[idx];
      if (c) {
        interleaved.push(c);
        anyTaken = true;
      }
    }
    if (!anyTaken) break;
    idx += 1;
  }

  // Final feed: interleaved live on top, starter cards as the tail so a
  // user who scrolls to the bottom still has something.
  const combined = [...interleaved, ...fallback].slice(0, limit);

  return {
    plan,
    cards: combined.length > 0 ? combined : fallback,
  };
}
