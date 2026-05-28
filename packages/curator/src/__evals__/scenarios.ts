/**
 * Curator evals — scenario corpus.
 *
 * Each scenario is a realistic conversation (a sequence of ContextEvents)
 * plus a set of CHECKS that assert what a good plan must / must not do.
 * The checks encode the product brief, not just keyword matching:
 *
 *   - "help what they're doing, not the literal keywords"  → facet + concept checks
 *   - "based on the goal AND what they're saying now,       → goal-persistence +
 *      not just the most recent thing they said"              topic-switch checks
 *   - "teach the wider ecosystem"                          → adjacent-topic checks
 *
 * Two buckets: `regular` (the everyday path) and `edge` (the cases that
 * used to break — frustration one-liners, brand collisions, single-word
 * bombs, topic switches, empty input).
 *
 * These run against the DETERMINISTIC planner (`planFromContext`) so they
 * are fully reproducible offline with no API keys. The LLM planners read
 * the same goal context, so passing here means the floor is solid even
 * when the network path is unavailable.
 */
import type { ContextEvent } from "@idex/types";
import type { CuratorPlan } from "../types.js";
import { planFromContext } from "../curator.js";
import type { SessionGoal } from "../goal.js";

/* ── event builders (deterministic timestamps) ──────────────────────── */
let _ts = 1_700_000_000_000;
export function u(text: string): ContextEvent {
  return { kind: "user_input", text, ts: _ts++ };
}
export function a(text: string): ContextEvent {
  return { kind: "agent_done", text, ts: _ts++ };
}

/* ── probe: run the planner and normalize for assertions ────────────── */
export interface PlanProbe {
  plan: CuratorPlan;
  queries: string[]; // lowercased xQueries
  topics: string[]; // lowercased direct + adjacent
  domain: string | null;
  facet: string | null;
}

export function probe(scenario: Scenario): PlanProbe {
  const plan = planFromContext({
    recentEvents: scenario.events.slice(-12),
    allEvents: scenario.events,
    statedGoal: scenario.statedGoal,
    goal: scenario.priorGoal,
    projectHint: scenario.projectHint,
  });
  return {
    plan,
    queries: plan.xQueries.map((q) => q.toLowerCase()),
    topics: [...plan.directTopics, ...plan.adjacentTopics].map((t) =>
      t.toLowerCase(),
    ),
    domain: plan.goal?.domain ?? null,
    facet: plan.goal?.facet ?? null,
  };
}

/* ── check builders ─────────────────────────────────────────────────── */
export interface Check {
  label: string;
  pass: (p: PlanProbe) => boolean;
}

/** At least one query matches. */
export const someQuery = (re: RegExp, label?: string): Check => ({
  label: label ?? `a query matches ${re}`,
  pass: (p) => p.queries.some((q) => re.test(q)),
});

/** No query matches (used to forbid junk: brand collisions, greetings…). */
export const noQuery = (re: RegExp, label?: string): Check => ({
  label: label ?? `no query matches ${re}`,
  pass: (p) => !p.queries.some((q) => re.test(q)),
});

/** At least one topic (direct or adjacent) matches. */
export const someTopic = (re: RegExp, label?: string): Check => ({
  label: label ?? `a topic matches ${re}`,
  pass: (p) => p.topics.some((t) => re.test(t)),
});

/** Every query is a real phrase, never a single-word query bomb. */
export const noSingleWordQueries: Check = {
  label: "no single-word queries",
  pass: (p) => p.queries.every((q) => q.trim().split(/\s+/).length >= 2),
};

/** This product's own namespace must never leak into a query. */
export const noSelfBrand: Check = {
  label: "no self-brand leakage (idex/cockpit/freebuff/moda/trygravity)",
  pass: (p) =>
    !p.queries.some((q) =>
      /\b(idex|cockpit|freebuff|moda|trygravity)\b/.test(q),
    ),
};

/** Frustration / affect words must never become a query. */
export const noAffectWords: Check = {
  label: "no affect words in queries (shit/sucks/garbage/broken…)",
  pass: (p) =>
    !p.queries.some((q) =>
      /\b(shit|sucks|crap|garbage|trash|terrible|awful|ugh|broken)\b/.test(q),
    ),
};

/** The derived goal domain matches. */
export const domainMatches = (re: RegExp): Check => ({
  label: `goal domain matches ${re}`,
  pass: (p) => p.domain != null && re.test(p.domain),
});

/** The current-message facet equals. */
export const facetIs = (f: string): Check => ({
  label: `facet is "${f}"`,
  pass: (p) => p.facet === f,
});

/** No query is just a verbatim echo of the latest sentence. */
export const notLiteralEcho = (literalFragment: RegExp): Check => ({
  label: `queries are conceptual, not a literal echo of ${literalFragment}`,
  pass: (p) => !p.queries.some((q) => literalFragment.test(q)),
});

/** Planner produced no queries (graceful empty — ambient feed takes over). */
export const emptyQueries: Check = {
  label: "no junk queries (empty → ambient feed)",
  pass: (p) => p.queries.length === 0,
};

/* ── scenario model ─────────────────────────────────────────────────── */
export interface Scenario {
  name: string;
  category: "regular" | "edge";
  note: string;
  events: ContextEvent[];
  statedGoal?: string;
  priorGoal?: SessionGoal;
  projectHint?: string;
  checks: Check[];
}

/* ───────────────────────────────────────────────────────────────────── *
 * REGULAR USE                                                            *
 * ───────────────────────────────────────────────────────────────────── */
const regular: Scenario[] = [
  {
    name: "stripe-webhooks",
    category: "regular",
    note: "Wiring Stripe webhooks, then a duplicate-delivery problem.",
    events: [
      u("I'm wiring up Stripe webhooks for my SaaS billing. How do I verify the signature?"),
      a("Use the Stripe-Signature header and stripe.webhooks.constructEvent with your signing secret. Make handlers idempotent."),
      u("the webhook handler keeps processing duplicate events, orders get charged twice"),
    ],
    checks: [
      someQuery(/stripe|webhook|idempoten|signature|duplicate/, "surfaces the stripe/webhook problem"),
      someTopic(/stripe|webhook/),
      noSingleWordQueries,
      noSelfBrand,
      noQuery(/\b(metals|firearm|beretta|fbi)\b/, "no brand-collision junk"),
    ],
  },
  {
    name: "nextjs-app-router",
    category: "regular",
    note: "Next.js App Router caching + revalidation (protected phrase).",
    events: [
      u("Building a Next.js app router project with server components. How does the fetch cache work?"),
      a("App Router caches fetches by default; opt out with cache: 'no-store' or revalidate."),
      u("how do I revalidate the cache after a server action mutation?"),
    ],
    checks: [
      someQuery(/app router|next|server component|cache|revalidat/, "tracks the app-router topic"),
      noSingleWordQueries,
      noSelfBrand,
    ],
  },
  {
    name: "rag-pipeline",
    category: "regular",
    note: "RAG over pgvector, chunking strategy.",
    events: [
      u("I'm building a RAG pipeline over my docs using pgvector and OpenAI embeddings."),
      a("Chunk by semantic boundaries, store embeddings in pgvector, add a reranker for precision."),
      u("what chunk size and overlap should I use for retrieval quality?"),
    ],
    checks: [
      someQuery(/rag|embedding|chunk|retriev|vector|pgvector|rerank/, "stays on the RAG problem"),
      domainMatches(/rag|vector|embedding/),
      someTopic(/pgvector|embedding|rag/),
      noSingleWordQueries,
    ],
  },
  {
    name: "tailwind-dashboard-ui",
    category: "regular",
    note: "Design-facet work: responsive dashboard with Tailwind + shadcn.",
    events: [
      u("I'm styling an analytics dashboard with Tailwind and shadcn/ui components."),
      a("Use a responsive grid, consistent spacing scale, and shadcn Card primitives."),
      u("the layout breaks on mobile, how do I make the sidebar responsive?"),
    ],
    checks: [
      facetIs("design"),
      someQuery(/tailwind|shadcn|ui|design|responsive|layout/, "design-relevant queries"),
      noSingleWordQueries,
      noSelfBrand,
    ],
  },
  {
    name: "postgres-slow-query",
    category: "regular",
    note: "Performance facet on a concrete stack (Postgres), not agents.",
    events: [
      u("My Postgres query joining orders and users is really slow on large tables."),
      a("Check the query plan with EXPLAIN ANALYZE; a composite index on the join+filter columns usually helps."),
      u("how do I make this query faster, indexes aren't helping"),
    ],
    checks: [
      facetIs("performance"),
      someQuery(/postgres|index|query|performance|latency|explain/, "perf on the real stack"),
      domainMatches(/postgres|query|index/),
      noAffectWords,
      noSingleWordQueries,
    ],
  },
  {
    name: "discovery-claude-code-skills",
    category: "regular",
    note: "Protected-phrase discovery query must survive tokenization.",
    events: [
      u("find me the best claude code skills and design engineering skills"),
    ],
    checks: [
      someQuery(/claude code/, "keeps the protected phrase intact"),
      noSingleWordQueries,
      noSelfBrand,
    ],
  },
];

/* ───────────────────────────────────────────────────────────────────── *
 * EDGE CASES                                                             *
 * ───────────────────────────────────────────────────────────────────── */
const edge: Scenario[] = [
  {
    name: "HEADLINE-agent-month-then-make-it-faster",
    category: "edge",
    note: "A month building an agent, then a low-signal frustration message. Must use the GOAL + performance intent, not the literal sentence.",
    events: [
      u("I'm building an autonomous research agent with LangGraph and tool calling."),
      a("LangGraph gives you a stateful graph; define nodes for plan, act, observe, and add tool nodes."),
      u("added memory and a retrieval tool to the agent, it can browse and summarize now"),
      a("Nice. Watch your context window — long agent traces blow up token usage fast."),
      u("the agent loops over tools a lot and the runs take forever"),
      a("Consider step limits, caching tool results, and a cheaper model for routing."),
      u("ok how do I make my agent faster? it's shit"),
    ],
    checks: [
      domainMatches(/agent/),
      facetIs("performance"),
      someQuery(/performance|latency|cost|optimi|speed|token/, "maps frustration → efficiency discourse"),
      someQuery(/agent/, "stays anchored to the agent goal"),
      notLiteralEcho(/make my agent faster/),
      noAffectWords,
      someTopic(/langgraph/, "remembers the stack from earlier in the session"),
      someQuery(/agent framework comparison|langgraph|crewai|reliable ai agents|token cost|latency/, "also teaches the wider ecosystem"),
      noSelfBrand,
      noSingleWordQueries,
    ],
  },
  {
    name: "greeting-only",
    category: "edge",
    note: "Bare greeting+addressee must not become topics.",
    events: [u("hey claude")],
    checks: [
      noQuery(/\bhey\b/, "greeting is not a topic"),
      noQuery(/\bclaude\b/, "the addressee is not a research interest"),
    ],
  },
  {
    name: "building-idex-itself",
    category: "edge",
    note: "Dogfooding IDEX — self-brand must be stripped, real topics kept.",
    projectHint: "idex",
    events: [
      u("working on idex, the cockpit curator keeps surfacing irrelevant cards"),
      a("Let's look at the curator ranking and the feed scoring."),
      u("fix the idex feed so the curator ranks relevance higher"),
    ],
    checks: [
      noSelfBrand,
      noQuery(/\bidex\b/, "no idex"),
      noQuery(/\bcockpit\b/, "no cockpit"),
      someQuery(/curator|feed|relevance|ranking/, "keeps the real topic"),
    ],
  },
  {
    name: "single-word-bomb-agents",
    category: "edge",
    note: "Bare 'agents' must be disambiguated, never fired raw.",
    events: [u("agents")],
    checks: [
      noSingleWordQueries,
      someQuery(/ai agent|agent framework|agent comparison|reliable ai agents/, "disambiguated to the AI/dev frame"),
    ],
  },
  {
    name: "discovery-best-agents",
    category: "edge",
    note: "'best agents out there' → comparisons/leaderboards, not the user's own tool.",
    events: [u("what are the best agents out there right now?")],
    checks: [
      facetIs("comparison"),
      domainMatches(/agent/),
      someQuery(/best ai agents|comparison|langgraph vs crewai|framework comparison/, "discovery → comparisons"),
      noQuery(/\bclaude\b/, "not the agent they're inside"),
      noQuery(/\bmcp\b/, "no MCP-alone"),
      noQuery(/\banthropic\b/, "no anthropic-alone"),
      noSingleWordQueries,
    ],
  },
  {
    name: "topic-switch-mid-session",
    category: "edge",
    note: "User pivots from a blog to a Discord bot — the goal must follow.",
    events: [
      u("I built a Next.js blog with MDX over the weekend"),
      a("Nice, MDX is great for content-heavy blogs."),
      u("actually forget the blog. I'm building a Discord bot now with slash commands"),
      a("discord.js v14 has a clean slash-command builder and an interactions gateway."),
      u("how do I register slash commands for my discord bot per guild?"),
      a("Register guild-scoped commands for instant updates; global commands take an hour to propagate."),
      u("the discord bot keeps timing out on the interaction response"),
    ],
    checks: [
      someQuery(/discord|slash command|bot|interaction/, "follows the pivot to discord"),
      domainMatches(/discord|bot|slash/),
      noSelfBrand,
      noSingleWordQueries,
    ],
  },
  {
    name: "code-paste-stack-trace",
    category: "edge",
    note: "A pasted error with prior React context — debug the concept, leak no paths/secrets.",
    events: [
      u("I'm building a React dashboard with a PostList component fed from a hook"),
      a("Make sure the hook returns a stable array and guards the loading state."),
      u("TypeError: Cannot read properties of undefined (reading 'map') at PostList line 42 — why?"),
    ],
    checks: [
      facetIs("debugging"),
      someQuery(/react|component|undefined|render|hook|debugging|pitfall/, "debugs the concept"),
      noQuery(/:\d/, "no raw line numbers in queries"),
      noQuery(/api[_-]?key|secret|token=/, "no secrets leak"),
      noSelfBrand,
    ],
  },
  {
    name: "empty-conversation",
    category: "edge",
    note: "Cold start — no events. Must not crash, must not invent junk.",
    events: [],
    checks: [emptyQueries],
  },
  {
    name: "competitor-ask-inside-claude",
    category: "edge",
    note: "Inside Claude Code, asking about Cursor/Windsurf — don't query their own tool.",
    events: [
      u("set up my project with the agent"),
      a("I'll scaffold the project structure and install dependencies with Claude Code."),
      u("honestly is cursor or windsurf better than this for big refactors?"),
    ],
    checks: [
      facetIs("comparison"),
      someQuery(/cursor|windsurf|comparison|alternative|vs/, "surfaces the competitors asked about"),
      noQuery(/\bclaude\b/, "doesn't chase the tool the user is already inside"),
      noSingleWordQueries,
    ],
  },
  {
    name: "pure-frustration-no-context",
    category: "edge",
    note: "Frustration with zero prior signal — detect intent, emit no garbage.",
    events: [u("ugh this is so broken I hate it")],
    checks: [
      facetIs("debugging"),
      noAffectWords,
      emptyQueries,
    ],
  },
  {
    name: "self-brand-mixed-with-real-topic",
    category: "edge",
    note: "Mentions idex AND a real ecosystem term — strip the brand, keep the topic.",
    events: [
      u("the idex curator surfaces too much langchain noise when I'm building agents"),
      a("We can tighten the ranking so off-domain framework spam drops."),
      u("yeah filter the langchain spam but keep agent content"),
    ],
    checks: [
      noQuery(/\bidex\b/, "brand stripped"),
      someQuery(/agent|langchain/, "real topic kept"),
      noSelfBrand,
    ],
  },
  {
    name: "sticky-goal-survives-window-slide",
    category: "edge",
    note: "Prior goal + a low-signal message with the early turns already out of the window. Goal must persist.",
    events: [u("make it faster")],
    priorGoal: {
      domain: "ai agents",
      anchorTopics: ["agents", "langgraph", "tools", "memory"],
      stack: ["langgraph"],
      statedGoal: null,
      facet: null,
      confidence: 0.85,
    },
    checks: [
      domainMatches(/agent/),
      facetIs("performance"),
      someQuery(/agent|latency|performance|cost|optimi/, "stays on goal despite a 3-word message"),
      noAffectWords,
    ],
  },
  {
    name: "stated-goal-overrides",
    category: "edge",
    note: "Explicit /goal channel anchors the feed even on an off-topic aside.",
    events: [u("hmm not sure what to do next")],
    statedGoal: "building a video generation REST API with queueing",
    checks: [
      domainMatches(/video|api|generation/),
      someQuery(/video|api|generation|queue/, "honors the stated goal"),
      noSingleWordQueries,
    ],
  },
];

export const scenarios: Scenario[] = [...regular, ...edge];
