import type { Card, ContextEvent } from "@idex/types";
import type { CuratorInput, CuratorPlan } from "./types.js";
import { getStarterCards } from "./starter-feed.js";
import { searchHackerNews } from "./hn.js";
import { searchReddit } from "./reddit.js";
import { searchBluesky } from "./bluesky.js";
import { searchX } from "./x.js";
import { planQueriesWithAgent } from "./agent-planner.js";

const STOP_WORDS = new Set([
  // Function words
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  // Imperative and filler verbs — "find me", "show me", "give me" are
  // conversational frames, not search signal. Dropping them means
  // "find me the best claude code skills" queries as "best claude code
  // skills" — the thing the user actually wants to find.
  "let","make","build","fix","help","need","want","please","try","then",
  "find","show","give","get","put","take","run","call","check","see","look",
  "use","using","using","used","go","goes","going","went","come","came",
  "add","tell","ask","say","said","know","knows","think","thinks","thought",
  // Over-general nouns from engineering prose
  "code","app","page","file","line","why","how","what","where","when","who",
  "like","can","will","would","should","could","just","really","maybe",
  "thing","stuff","some","any","all","lots","more","most","less","same",
  "about","into","onto","over","under","than","also","here","there","now",
  "one","two","three","first","last","next","still","already","even","only",
  // Ambient filler
  "very","super","actually","basically","probably","definitely","kinda",
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

/**
 * Extract PascalCase / camelCase identifiers from the raw text — these
 * are the gold in any coding conversation (component names, hooks,
 * libraries) and lowercasing everything loses them. We pick them up
 * before we destroy casing.
 */
function extractIdentifiers(text: string): string[] {
  // Matches: PostEditor, useEffect, API_TOKEN (3+ chars), file names with
  // dots (.tsx / .ts). Conservative so we don't grab every capitalized
  // word at sentence start.
  const re = /\b([A-Z][a-zA-Z0-9]{2,}|[a-z]+[A-Z][a-zA-Z0-9]+)\b/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** Pull quoted phrases ("something", 'thing') — they're explicit user intent. */
function extractQuoted(text: string): string[] {
  const re = /["'`]([^"'`\n]{3,64})["'`]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function naiveTopics(events: ContextEvent[], maxTopics = 8): string[] {
  // Separate user vocabulary from agent vocabulary — tokens that appear
  // in BOTH are strong topic signal (shared vocabulary between user and
  // the agent is the thing the conversation is actually about).
  const userText = events
    .filter((e) => e.kind === "user_input")
    .map((e) => ("text" in e ? e.text : ""))
    .join(" ");
  const agentText = events
    .filter((e) => e.kind === "agent_chunk" || e.kind === "agent_done")
    .map((e) => ("text" in e ? e.text : ""))
    .join(" ");
  const combined = `${userText} ${agentText}`;

  // Grab casing-preserved signal first.
  const identifiers = extractIdentifiers(combined);
  const quoted = extractQuoted(combined);

  // Then tokenise case-insensitively for the general-vocabulary pool.
  const tokens = combined.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [];

  // Shared vocab (appearing in both user + agent streams) gets a 3×
  // weight because the user asked about it AND the agent talked about
  // it back — that's the topic.
  const userTokens = new Set(
    (userText.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(
      (t) => !STOP_WORDS.has(t),
    ),
  );
  const agentTokens = new Set(
    (agentText.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(
      (t) => !STOP_WORDS.has(t),
    ),
  );

  const counts = new Map<string, number>();
  for (const tok of tokens) {
    if (STOP_WORDS.has(tok)) continue;
    if (tok.length < 3) continue;
    const isShared = userTokens.has(tok) && agentTokens.has(tok);
    const bump = isShared ? 3 : 1;
    counts.set(tok, (counts.get(tok) ?? 0) + bump);
  }

  // Identifiers carry extra weight — PostEditor, useRouter, etc. Add
  // them both in lowercase form (for the count map) and in preserved
  // case so the query strings read naturally.
  for (const id of identifiers) {
    const lc = id.toLowerCase();
    if (STOP_WORDS.has(lc)) continue;
    counts.set(lc, (counts.get(lc) ?? 0) + 4);
  }

  // Quoted phrases are explicit user intent — bump massively.
  for (const q of quoted) {
    const lc = q.toLowerCase().trim();
    if (lc.length >= 3) counts.set(lc, (counts.get(lc) ?? 0) + 6);
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

  // Build real search queries, not single tokens.
  //
  // The old plan returned single words like "claude" which matched every
  // generic Anthropic blog post. If the user typed "best claude code
  // skills and design skills" we want the search engines to see that
  // whole phrase — HN's Algolia, Reddit's JSON search and Bluesky's
  // searchPosts all do well with multi-word queries and badly with bare
  // keywords.
  const promptText =
    lastUserPrompt && "text" in lastUserPrompt ? lastUserPrompt.text.trim() : "";
  const smartQueries: string[] = [];
  if (promptText.length >= 4) {
    // Take up to the first ~8 significant words of the prompt. Strip
    // punctuation that confuses query parsers, drop stop-words so the
    // query stays dense with signal. We keep longer phrases over
    // shorter ones so "claude code skills" wins over "skills".
    const words = promptText
      .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()))
      .slice(0, 8);
    if (words.length >= 2) smartQueries.push(words.join(" "));
    if (words.length >= 3) smartQueries.push(words.slice(0, 3).join(" "));
  }
  if (topics.length >= 2) {
    // "<top-topic> <second-topic>" — e.g. "claude skills" — as an
    // intermediate specificity.
    smartQueries.push(`${topics[0]} ${topics[1]}`);
  }
  // Single topics as a last-resort broadening so we always have *some*
  // queries even if the prompt was 1-2 words.
  smartQueries.push(...topics.slice(0, 3));

  // De-dupe preserving order (first occurrence wins — most specific first).
  const seen = new Set<string>();
  const xQueries = smartQueries
    .map((q) => q.trim())
    .filter((q) => q.length >= 3)
    .filter((q) => {
      const key = q.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);

  return {
    summary: input.projectHint
      ? `Working in ${input.projectHint}`
      : `Working on: ${intent}`,
    intent,
    directTopics: topics.slice(0, 4),
    adjacentTopics: topics.slice(4),
    xQueries,
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

interface CurateLiveOptions {
  /** Max cards in the final result set. Larger values = longer feel-real feed. */
  limit?: number;
  /**
   * Optional X (Twitter) v2 Bearer Token. When provided, the curator
   * hits the real X API in parallel with HN/Reddit/Bluesky so the feed
   * surfaces actual tweets instead of only open-web surrogates. Missing
   * token = X is silently skipped.
   */
  xBearerToken?: string | null;
  /**
   * Optional OpenRouter API key. When provided, the curator replaces the
   * naive token-extraction query plan with an LLM-generated one — the
   * model reads the last few turns and returns 4 natural-language
   * queries tuned for X search. Missing key = fall back to naive plan.
   */
  openRouterKey?: string | null;
}

/**
 * Async curator — searches Hacker News, Reddit, and Bluesky in parallel
 * across several topics. Returns a much bigger ranked set so the feed
 * feels like an actual infinite stream instead of a 12-card demo.
 */
export async function curateLive(
  input: CuratorInput,
  opts: CurateLiveOptions = {},
): Promise<{ plan: CuratorPlan; cards: Card[] }> {
  const plan = planFromContext(input);
  // 120 cards is long enough to feel like an actual infinite scroll —
  // roughly 20 screens of content on a laptop display — without tipping
  // into "never-ending feed fatigue" territory. The old 40-card cap
  // made the feed feel like a demo the moment you started scrolling.
  const limit = opts.limit ?? 120;

  // Starter feed always contributes as a backstop — ranked low so live hits
  // push it to the bottom of the feed.
  const fallback = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 10,
  });

  // Agent-driven query planner. If the user has an OpenRouter key
  // configured, we let a small LLM read the conversation and hand us 4
  // natural-language queries that map to what the user's actually
  // doing. No key / network failure / parse failure → fall back to the
  // naive token plan, which is still better than ambient noise.
  let queries = plan.xQueries.length > 0 ? plan.xQueries : DEFAULT_AMBIENT_TOPICS.slice(0, 4);
  if (opts.openRouterKey) {
    const agentPlan = await planQueriesWithAgent({
      recentEvents: input.recentEvents,
      projectHint: input.projectHint,
      openRouterKey: opts.openRouterKey,
    });
    if (agentPlan && agentPlan.queries.length > 0) {
      queries = agentPlan.queries;
    }
  }

  // Three sources × up to 4 queries = up to 12 parallel fetches. Each
  // asks for more per-query results than before so the feed has real
  // depth. All fetches share a 4s AbortSignal timeout so worst-case we
  // wait ~4s and fall back to partial data.
  const xToken = opts.xBearerToken ?? null;
  const liveResults = await Promise.all(
    queries.flatMap((q) => [
      searchHackerNews(q, 20),
      searchReddit(q, 15),
      searchBluesky(q, 25),
      // X only fires if the user has configured a bearer token. We put
      // more weight on X results by asking for more per query — when a
      // developer says "query the Twitter API" they mean this source
      // should dominate the mix, not be a minority voice.
      searchX(q, xToken ?? "", 40),
    ]),
  );
  // Keep only cards that can actually render as tweets (text body +
  // author). The starter feed always has this; third-party sources
  // sometimes return posts with empty bodies or missing handles — those
  // collapse to "Unknown @anon" placeholders that scream "broken
  // feed," so we drop them before dedupe.
  const live = liveResults.flat().filter((c) => {
    if (!c.fallback) return false;
    const text = c.fallback.text?.trim() ?? "";
    const author = c.fallback.author?.handle || c.fallback.author?.name;
    return text.length > 0 && !!author;
  });

  // Dedupe by id.
  const seen = new Set<string>();
  const liveUnique = live.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Light source-balancing: interleave HN / Reddit / Bluesky so the feed
  // doesn't look like 20 HN items in a row.
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
