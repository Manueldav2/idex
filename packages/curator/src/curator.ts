import type { Card, ContextEvent } from "@idex/types";
import type { CuratorInput, CuratorPlan } from "./types.js";
import { getStarterCards } from "./starter-feed.js";
import { searchHackerNews } from "./hn.js";
import { searchReddit } from "./reddit.js";
import { searchBluesky } from "./bluesky.js";
import { searchX } from "./x.js";
import { planQueriesWithAgent } from "./agent-planner.js";
import { callGLM46 } from "./openrouter.js";
import { searchTweets } from "./composio.js";
import {
  deriveGoal,
  synthesizeGoalQueries,
  goalContextString,
  type SessionGoal,
} from "./goal.js";

const STOP_WORDS = new Set([
  // Function words
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  // Greetings + conversational address — when a user says "hey claude,
  // what are the best agents out there" the curator was picking up "hey"
  // and "claude" as top topics, then surfacing "mcp · hey" peek labels.
  // Greetings are NEVER a topic.
  "hey","hi","hello","yo","sup","listen","alright","okay","thanks","thank",
  // Imperative and filler verbs — "find me", "show me", "give me" are
  // conversational frames, not search signal.
  "let","make","build","fix","help","need","want","please","try","then",
  "find","show","give","get","put","take","run","call","check","see","look",
  "use","using","used","go","goes","going","went","come","came",
  "add","tell","ask","say","said","know","knows","think","thinks","thought",
  "best","better","good","great","awesome",
  // Generic grammar / filler.
  "why","how","what","where","when","who","out","are","were",
  "like","can","will","would","should","could","just","really","maybe",
  "thing","stuff","some","any","all","lots","more","most","less","same",
  "about","into","onto","over","under","than","also","here","there","now",
  "one","two","three","first","last","next","still","already","even","only",
  // Ambient filler
  "very","super","actually","basically","probably","definitely","kinda",
  // Affect / frustration — these carry intent (handled by the goal
  // facet detector) but are NEVER topics. Without this, "it's shit,
  // make it faster" surfaced "shit" as a top topic and a search query.
  "shit","sucks","crap","garbage","trash","terrible","awful","ugh",
  "damn","hate","broken","slow","fast","faster","slower","annoying",
  // Conversational filler — "hmm not sure" is not a search query.
  "not","sure","hmm","yeah","nah","honestly","gonna","wanna","lemme",
]);

/**
 * Compound phrases we want to keep intact across the query plan.
 * "claude code" is the single most important one — without this the
 * planner sometimes splits it into `claude` (generic Anthropic) and
 * `code` (stop-worded away) and the user gets Tucker Carlson instead
 * of Claude Code posts. Same principle for other high-signal term
 * clusters that any tokenizer would otherwise break.
 */
const PROTECTED_PHRASES = [
  "claude code",
  "claude skills",
  "cursor ide",
  "next.js app router",
  "app router",
  "server components",
  "react server components",
  "tailwind css",
  "open ai",
  "openai codex",
];

function findProtectedPhrases(text: string): string[] {
  const low = text.toLowerCase();
  return PROTECTED_PHRASES.filter((p) => low.includes(p));
}

/**
 * Strip self-brand tokens from a query string. Keeps the query's natural
 * shape (multi-word queries don't get destroyed) but drops a leaked brand
 * token without turning into a single-word query.
 */
/**
 * Single-word queries are query bombs — "agents" matches FBI agents,
 * ICE agents, user-agent strings, travel agents, real-estate agents,
 * etc. We never want them to reach HN/Reddit/X verbatim. This expands
 * a single token into 3 disambiguating queries that always pair the
 * token with an AI/dev qualifier or comparison frame.
 *
 *   "agents" → ["ai agents 2026", "best ai agents", "agent frameworks comparison"]
 *   "rag"    → ["rag pipeline 2026",  "best rag",       "rag retrieval evaluation"]
 *
 * Multi-word queries pass through untouched. This is the single most
 * important quality fix in the deterministic path because without it
 * the curator surfaces FBI / immigration / browser-string content
 * whenever the user mentions a generic tech word.
 */
function expandSingleWord(q: string): string[] {
  const trimmed = q.trim();
  if (trimmed.split(/\s+/).length >= 2) return [trimmed];
  const t = trimmed.toLowerCase();
  // Generic tech tokens that desperately need a disambiguating frame.
  const AI_TOKEN_QUALIFIERS = new Set([
    "agent","agents","llm","llms","rag","mcp","prompt","prompts",
    "embedding","embeddings","model","models","copilot","copilots",
    "assistant","assistants","tool","tools","orchestration",
  ]);
  if (AI_TOKEN_QUALIFIERS.has(t)) {
    return [`ai ${t} 2026`, `best ai ${t}`, `${t} comparison`];
  }
  // Dev-flavoured fallback for any other single word — pair with year
  // and the developer-tools frame so we don't get news-category junk.
  return [`${t} 2026`, `best ${t} for developers`, `${t} comparison`];
}

function sanitizeQuery(q: string): string {
  const cleaned = q
    .split(/\s+/)
    .filter((w) => !SELF_BRAND_TOKENS.has(w.toLowerCase()))
    .join(" ")
    .trim();
  return cleaned;
}

/**
 * Drop cards that are clearly false-positive brand/namespace collisions
 * (IDEX Metals mining stock, Beretta IDEX firearms, etc.). Cheap, no
 * LLM call — purely regex on title + body.
 */
export function filterBrandCollisions(cards: Card[]): Card[] {
  return cards.filter((c) => {
    const haystack = [
      c.fallback?.text ?? "",
      c.fallback?.author?.handle ?? "",
      c.fallback?.author?.name ?? "",
      c.url ?? "",
      c.relevanceReason ?? "",
    ].join(" ");
    return !NEGATIVE_BRAND_MARKERS.some((re) => re.test(haystack));
  });
}

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
 * Tokens that ARE the product/brand itself — never query for these. When
 * a developer is building IDEX itself, "IDEX" leaks into queries and the
 * feed fills with IDEX Metals (mining stock), Beretta IDEX (firearms), and
 * other unrelated namespace collisions.
 *
 * NB: we deliberately do NOT exclude "agent"/"agents" here anymore. For
 * users building agentic systems, "agent" IS the topic, not the brand —
 * stripping it collapsed queries like "slack notifications agent" into
 * "slack notifications" and the feed missed the entire agentic ecosystem
 * (LangChain, AutoGen, CrewAI, OpenAI Assistants, etc.) the user wanted.
 * "agent" only becomes brand-collision-prone when paired with "idex" /
 * "cockpit", which the surrounding token filter still catches.
 */
const SELF_BRAND_TOKENS = new Set([
  "idex",
  "cockpit",
  "freebuff",
  "moda",
  "trygravity",
  "bun",
]);

/**
 * Conversational-context tokens — words that get injected by the AGENT
 * (Claude) into every response but rarely represent the user's actual
 * research interest. We keep them iff the USER explicitly typed them,
 * and drop them otherwise. Lets "hey claude what are best agents" turn
 * into agent-comparison queries (right), while "what's the best mcp
 * server" still surfaces MCP content (the user asked about MCP).
 */
const AGENT_CONTEXT_TOKENS = new Set([
  "claude",
  "anthropic",
  "mcp",
]);

/**
 * Markers that indicate a card is a brand/namespace collision, NOT a
 * software-developer-relevant result. If a card title or body matches any
 * of these and the conversation isn't about that domain, drop it.
 */
const NEGATIVE_BRAND_MARKERS = [
  /idex\s+metals/i,
  /idex\.v\b/i,                 // IDEX Metals stock ticker
  /beretta/i,                   // Beretta IDEX firearms
  /\bnarp\b/i,                  // Beretta Project NARP
  /idex\s+(corp|inc|ltd|holdings)/i,
  /\bidex[-–]2025[-–]beretta/i,
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

/**
 * Strip conversational greeting + addressee at the start of a prompt.
 * "hey claude, what are best agents" → "what are best agents".
 * Without this, the addressee ("claude") leaks into the topic
 * extraction and the curator chases the user's own agent as a
 * research topic.
 */
function stripGreetingAddress(text: string): string {
  return text.replace(
    /^\s*(?:hey|hi|hello|yo|sup|listen)\s+\w+([\s,;:.\-—]+|$)/i,
    "",
  );
}

function naiveTopics(events: ContextEvent[], maxTopics = 8): string[] {
  // Separate user vocabulary from agent vocabulary — tokens that appear
  // in BOTH are strong topic signal (shared vocabulary between user and
  // the agent is the thing the conversation is actually about).
  const userText = events
    .filter((e) => e.kind === "user_input")
    .map((e) => ("text" in e ? stripGreetingAddress(e.text) : ""))
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
    if (SELF_BRAND_TOKENS.has(tok)) continue;
    if (tok.length < 3) continue;
    // Skip Claude/Anthropic/MCP unless the user actually typed them.
    // Without this guard the curator picks up "MCP" from Claude's
    // responses and surfaces MCP cards even when the user asked about
    // something else entirely.
    if (AGENT_CONTEXT_TOKENS.has(tok) && !userTokens.has(tok)) continue;
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
  // Derive the long-horizon goal from the FULL history when available
  // (the agent store keeps up to 200 events). Recurrence across turns is
  // the goal signal, and a 12-event window is too short to see it. The
  // previous goal (if any) is folded back in so the domain stays sticky
  // across refreshes even as the window slides past the early turns.
  const allEvents = input.allEvents ?? input.recentEvents;
  const goal: SessionGoal = deriveGoal(allEvents, {
    prev: input.goal ?? null,
    statedGoal: input.statedGoal ?? input.goal?.statedGoal ?? null,
  });

  const topics = naiveTopics(input.recentEvents);
  const lastUserPrompt =
    [...input.recentEvents].reverse().find((e) => e.kind === "user_input");
  const intent = goal.statedGoal
    ? goal.statedGoal.slice(0, 240)
    : lastUserPrompt && "text" in lastUserPrompt
      ? lastUserPrompt.text.slice(0, 240)
      : "exploring code";

  // Build real search queries, not single tokens.
  const promptText =
    lastUserPrompt && "text" in lastUserPrompt
      ? stripGreetingAddress(lastUserPrompt.text).trim()
      : "";

  // --- (A) Literal queries from the CURRENT message (what they're saying
  //     right now). Protected phrases are explicit user references and
  //     always rank first. ---
  const protectedInPrompt = findProtectedPhrases(promptText);
  const literalQueries: string[] = [];
  let currentContentWordCount = 0;

  if (promptText.length >= 4) {
    const words = promptText
      .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
    currentContentWordCount = words.length;

    // "claude code skills", "claude code design" etc.
    for (const phrase of protectedInPrompt) {
      for (const w of words) {
        const wl = w.toLowerCase();
        if (phrase.split(/\s+/).includes(wl)) continue;
        literalQueries.push(`${phrase} ${w}`);
      }
    }

    // Full trimmed prompt (capped) as a catch-all phrase query.
    const trimmedWords = words.slice(0, 6);
    if (trimmedWords.length >= 2) literalQueries.push(trimmedWords.join(" "));
  }
  if (topics.length >= 2 && protectedInPrompt.length === 0) {
    literalQueries.push(`${topics[0]} ${topics[1]}`);
  }

  // --- (B) Conceptual queries from the GOAL × current FACET. This is the
  //     "help what they're doing, not the keywords" half: "make my agent
  //     faster, it's shit" → "ai agent latency reduction",
  //     "reduce llm agent token cost", not a literal search of the
  //     sentence. Also the "help them learn" half (ecosystem queries). ---
  const goalQueries = synthesizeGoalQueries(goal);

  // --- Blend. Lead with the conceptual goal queries when the current
  //     message is low-signal (frustration / one-liner) OR we have a
  //     confident goal + a clear current need, OR the user stated a goal
  //     explicitly. Otherwise lead with the literal current request and
  //     keep the goal queries as the teaching tail. Protected phrases
  //     always come first either way. ---
  const lowSignal = currentContentWordCount < 2;
  const goalLeads =
    Boolean(goal.statedGoal) ||
    lowSignal ||
    (Boolean(goal.domain) && Boolean(goal.facet) && goal.confidence >= 0.5);

  const smartQueries: string[] = goalLeads
    ? [...protectedInPrompt, ...goalQueries, ...literalQueries]
    : [...protectedInPrompt, ...literalQueries, ...goalQueries];

  // Last resort: never ship empty. Single tokens get disambiguated.
  if (smartQueries.length === 0) smartQueries.push(...topics.slice(0, 3));

  // De-dupe preserving order (first occurrence wins — most specific first).
  const seen = new Set<string>();
  const xQueries = smartQueries
    .map((q) => sanitizeQuery(q))
    .filter((q) => q.length >= 3)
    .filter((q) => {
      const key = q.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .flatMap(expandSingleWord)
    .slice(0, 5);

  // directTopics = the immediate signal (what they're saying now).
  // adjacentTopics = the goal + ecosystem (what they're building over
  // time + what to learn). Seeding adjacents from the goal means the
  // "teach the wider problem space" promise holds even with NO LLM key.
  const adjacentSeen = new Set(topics.slice(0, 4).map((t) => t.toLowerCase()));
  const adjacentTopics: string[] = [];
  for (const t of [...goal.anchorTopics, ...goal.stack, ...topics.slice(4)]) {
    const key = t.toLowerCase();
    if (adjacentSeen.has(key)) continue;
    adjacentSeen.add(key);
    adjacentTopics.push(t);
  }

  const summary = goal.domain
    ? `Building ${goal.domain}${goal.facet ? ` · needs ${goal.facet} help` : ""}`
    : input.projectHint
      ? `Working in ${input.projectHint}`
      : `Working on: ${intent}`;

  return {
    summary,
    intent,
    directTopics: topics.slice(0, 4),
    adjacentTopics: adjacentTopics.slice(0, 8),
    xQueries,
    goal,
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
  /**
   * Optional X (Twitter) v2 Bearer Token. When provided, the curator
   * hits the real X API in parallel with HN/Reddit/Bluesky so the feed
   * surfaces actual tweets instead of only open-web surrogates. Missing
   * token = X is silently skipped.
   */
  xBearerToken?: string | null;
  /**
   * Optional OpenRouter API key. When provided, the curator replaces the
   * naive token-extraction query plan with an Gemini Flash-generated
   * plan (agent-planner.ts). Missing key = fall back to naive plan.
   */
  openRouterKey?: string | null;
  /**
   * Phase 2 credentials bundle (OpenRouter + Composio). GLM-4.6 runs
   * when `credentials.openrouterApiKey` is set; Composio X fires when
   * both `composioApiKey` and `composioConnectedAccountId` are set.
   */
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
  // 120 cards for the infinite-scroll feel. Phase 2 used 40; the new
  // direction wants a taller feed so the wait-for-the-agent loop has
  // real depth.
  const limit = opts.limit ?? 120;
  const creds = opts.credentials ?? {};

  let plan: CuratorPlan = deterministic;

  // The deterministic plan always carries a derived goal. We hand a
  // compact description of it to the LLM planners so live curation stays
  // anchored to the long-horizon goal (and the current need) instead of
  // re-planning off the tail of the transcript like it used to.
  const goal = deterministic.goal ?? null;
  const goalContext = goal ? goalContextString(goal) : null;

  // Phase 2 planner: GLM-4.6 via OpenRouter, strict JSON-schema. Runs
  // only when the Phase 2 credentials bundle is present. Falls back to
  // the deterministic plan on any failure.
  if (creds.openrouterApiKey) {
    try {
      const conversation = buildTranscript(input.recentEvents);
      if (conversation.length > 0) {
        plan = await callGLM46({
          apiKey: creds.openrouterApiKey,
          conversation,
          projectHint: input.projectHint,
          goalContext,
        });
        // Keep the derived goal on the LLM plan so the call site can
        // persist it across refreshes.
        plan = { ...plan, goal: plan.goal ?? goal ?? undefined };
      }
    } catch {
      plan = deterministic;
    }
  }

  // Starter feed always contributes as a backstop — ranked low so live hits
  // push it to the bottom of the feed.
  const fallback = getStarterCards({
    topics: [...plan.directTopics, ...plan.adjacentTopics],
    count: 10,
  });

  // Agent-driven query planner (natural-phrase X queries, intent-vector
  // from terminal context). Runs whenever any OpenRouter key is available —
  // its xQueries take precedence over the GLM-4.6 plan because the agent
  // planner's system prompt is specifically tuned for "what would a senior
  // engineer in this problem space type into X search this week", which
  // outranks the broader topic-plan GLM-4.6 produces. Both planners use the
  // same model pool; we run them in parallel for the no-extra-latency case.
  let queries = plan.xQueries.length > 0 ? plan.xQueries : DEFAULT_AMBIENT_TOPICS.slice(0, 4);
  const plannerKey = opts.openRouterKey ?? creds.openrouterApiKey ?? null;
  if (plannerKey) {
    const agentPlan = await planQueriesWithAgent({
      recentEvents: input.recentEvents,
      projectHint: input.projectHint,
      openRouterKey: plannerKey,
      goalContext,
    });
    if (agentPlan && agentPlan.queries.length > 0) {
      // Prefer agent-planner queries; preserve any from GLM-4.6 as tail
      // so adjacent-topic coverage doesn't shrink to 4.
      const merged: string[] = [];
      const mergedSeen = new Set<string>();
      for (const q of [...agentPlan.queries, ...plan.xQueries]) {
        const k = q.toLowerCase().trim();
        if (!k || mergedSeen.has(k)) continue;
        mergedSeen.add(k);
        merged.push(q);
      }
      queries = merged.slice(0, 6);
      // Surface the agent-planner reason in the plan for the cockpit header.
      if (agentPlan.reason && plan.summary === deterministic.summary) {
        plan = { ...plan, summary: agentPlan.reason };
      }
    }
  }
  // Promote adjacent topics into the live query pool. The LLM emits up to
  // 8 conceptual topics (specific frameworks, ecosystem players, adjacent
  // sub-fields) — previously these only decorated the plan summary and
  // never reached the search layer, so the feed felt keyword-bound. Now
  // we fire searches for the top 4 adjacent topics alongside xQueries
  // so the feed actually surfaces the wider problem-space discussion
  // (e.g. LangChain / CrewAI threads when the user is wiring an agentic
  // slack bot, rather than only "slack notifications" results).
  // Promote adjacent topics into the live query pool. Previously this
  // required multi-word topics (`split >= 2`), which silently dropped
  // every single-word ecosystem name the goal/LLM surfaced (langgraph,
  // crewai, inngest…) — exactly the "teach the ecosystem" content. Now a
  // single-word adjacent is disambiguated through expandSingleWord (one
  // expansion each) instead of being thrown away.
  const adjacentAsQueries = plan.adjacentTopics
    .map((t) => sanitizeQuery(t))
    .filter((t) => t.length >= 3)
    .flatMap((t) =>
      t.split(/\s+/).length >= 2 ? [t] : expandSingleWord(t).slice(0, 1),
    )
    .slice(0, 4);
  // De-dupe across xQueries + adjacent to avoid double-firing the same
  // string against HN/Reddit/Bluesky.
  const queryPool: string[] = [];
  const queryPoolSeen = new Set<string>();
  for (const q of [...queries, ...adjacentAsQueries]) {
    const key = q.toLowerCase().trim();
    if (!key || queryPoolSeen.has(key)) continue;
    queryPoolSeen.add(key);
    queryPool.push(q);
  }
  // Cap total fan-out so we don't hammer search APIs on every refresh.
  queries = queryPool.slice(0, 6);
  const xQueries = (plan.xQueries.length > 0 ? plan.xQueries : queries).slice(0, 4);

  // Sources run in parallel.
  // * HN / Reddit / Bluesky always fire.
  // * Direct X fires when a bearer token is set.
  // * Composio X fires when the Phase 2 creds are connected.
  const hasComposioX = Boolean(creds.composioApiKey && creds.composioConnectedAccountId);
  const xToken = opts.xBearerToken ?? null;

  const fetches: Array<Promise<Card[]>> = [];
  for (const q of queries) {
    fetches.push(searchHackerNews(q, 20));
    fetches.push(searchReddit(q, 15));
    // Bluesky is the zero-auth X replacement. The migration off
    // Twitter (2023-2025) landed most dev-scene accounts here:
    // simonw.bsky.social, dhh.bsky.social, swyx.bsky.social,
    // paulg.bsky.social etc. Real avatars, real engagement, no auth.
    // Ask for more per query than HN/Reddit because each Bluesky
    // result already renders as a tweet-shaped card.
    fetches.push(searchBluesky(q, 40));
    if (xToken) fetches.push(searchX(q, xToken, 40));
  }
  if (hasComposioX) {
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
  // Drop cards with empty body or missing author — third-party sources
  // sometimes return those and they collapse to "Unknown @anon"
  // placeholders that scream "broken feed".
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
  const combined = filterBrandCollisions([...interleaved, ...fallback]).slice(0, limit);

  return {
    plan,
    cards: combined.length > 0 ? combined : fallback,
  };
}
