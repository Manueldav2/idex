/**
 * OpenRouter client — talks to the GLM-4.6 chat model through OpenRouter's
 * OpenAI-compatible REST API. We use plain `fetch()` instead of the full
 * `openai` SDK to keep the curator package dependency-free (the renderer
 * runs this directly and we don't want to ship megabytes of SDK for a
 * single structured-output call).
 *
 * If the call fails — no key, bad key, timeout, rate limit, invalid JSON —
 * the caller is expected to fall back to the deterministic
 * `planFromContext()` path. The curator is designed to degrade gracefully.
 */
import type { CuratorPlan } from "./types.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
// Default to a free open-source model so users can run the smart curator
// with just a free-tier OpenRouter key. Llama 3.3 70B follows strict-JSON
// instructions reliably and is no-cost on OpenRouter's free pool.
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * JSON schema the model is instructed to emit. Kept in sync with
 * `CuratorPlan` in `./types.ts`. Loose enough that token-level errors
 * don't bork the whole pipeline — we validate + coerce on the way out.
 */
const CURATOR_PLAN_SCHEMA = {
  name: "curator_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      intent: { type: "string" },
      directTopics: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
      },
      adjacentTopics: {
        type: "array",
        items: { type: "string" },
        maxItems: 8,
      },
      xQueries: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
      },
    },
    required: ["summary", "intent", "directTopics", "adjacentTopics", "xQueries"],
  },
} as const;

const SYSTEM_PROMPT = `You are IDEX's Curator. You read a developer's recent prompts to their coding agent and produce a JSON plan that drives a contextual feed of tweets, HN/Reddit threads, and Bluesky posts. The goal is NOT to echo the user's keywords back — it's to surface the conversations a thoughtful senior engineer in that exact problem space is having right now.

Think conceptually, then write queries:

1. Identify the DOMAIN (not the keywords). "fix my slack notifications retry loop in the agent" → domain is "AI agents doing chat-ops + notification reliability + retry/backoff patterns", NOT "slack" and "retry".

2. Climb the abstraction ladder when picking adjacentTopics. Three good rungs above the user's literal text:
   - the immediate sub-field (agentic systems, retrieval, async messaging…)
   - the ecosystem players (LangChain, CrewAI, AutoGen, OpenAI Assistants, Anthropic Claude, Inngest, Trigger.dev, Mastra, Pipedream…)
   - the analogous practices in adjacent fields (Slack bot UX, AI in DevOps, event-driven architecture, durable execution, etc.)
   Name SPECIFIC frameworks, libraries, products, and well-known thought-leaders. "AI tools" is lazy; "LangGraph vs CrewAI for multi-agent" is useful.

3. Write xQueries that a developer would actually type into X search to find the most interesting current discussion. Each query is 2-6 words, a natural phrase, opinionated:
   - "LangGraph vs CrewAI 2026" (good — opinionated, recent, ecosystem)
   - "slack bot LLM retry pattern" (good — specific, problem-focused)
   - "slack notifications" (bad — too generic, returns marketing)
   - "agent" (bad — single token, matches everything)
   Mix 2 queries on the immediate problem + 2 queries on the wider ecosystem so the feed both helps the current task AND teaches.

Schema:
- "directTopics" (max 5, 1-3 words): precise keywords pulled from the conversation. These are the literal labels.
- "adjacentTopics" (max 8): the abstraction-ladder topics — specific frameworks, ecosystems, communities, related sub-fields. Be opinionated. No filler like "best practices" or "tutorials".
- "xQueries" (3-5): natural-phrase search strings, as above.
- "summary" (one sentence): what they're working on.
- "intent" (5-10 words): the goal.

Discovery / "best X" prompts (CRITICAL):
- "what are the best agents out there" → 2026 reviews, framework comparisons, agent leaderboards. NOT "claude" or "mcp" or "ai" alone.
  Good xQueries: "best ai agents 2026", "langgraph vs crewai", "devin cursor cline comparison", "agent benchmarks swe-bench"
  Bad: "claude agents", "ai mcp", "anthropic agents"
- Never query for the user's CURRENT TOOL when they ask about alternatives ("claude" / "claude code" / "cursor" should not appear when the user is asking about competitors).

Goal context (when provided): you may receive the user's long-running goal, stack, and current need, derived from the WHOLE session — not just the latest turn. Treat it as the anchor. If the latest message is short, vague, or just frustration ("it's shit", "make it faster"), plan against the GOAL plus the stated need (goal "ai agents" + need "performance" → directTopics about agent latency/cost; xQueries like "ai agent latency optimization", "llm agent cost reduction"), NOT a literal echo of the latest sentence.

Hard rules:
- Never include "IDEX", "cockpit", "freebuff", "moda", or "trygravity" — this product's namespace.
- Never include "Claude", "Anthropic", or "MCP" by themselves — those are the agent the user is INSIDE, not their research interest. (Multi-word phrases like "claude code skills" are fine when the user explicitly references the product.)
- Never include greetings (hey, hi, hello) or generic verbs (fix, build, make) in queries.
- Never include code snippets, secrets, file paths, or PII from the conversation.
- Never return single-word queries. If unsure, write a 2-word phrase.
- Output must match the schema exactly. No prose, no markdown, no fences.`;

export interface CallGLMOptions {
  apiKey: string;
  conversation: string;
  projectHint?: string;
  /**
   * Long-horizon goal context (domain / stack / current need) derived
   * from the whole session. Anchors the plan to what the user is building
   * over time rather than only the most recent turn.
   */
  goalContext?: string | null;
  timeoutMs?: number;
  /**
   * Optional endpoint override — used by tests.
   */
  baseUrl?: string;
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
}

/**
 * Ask GLM-4.6 for a CuratorPlan. Throws on any failure so the caller can
 * fall back deterministically. Never returns a partially-valid plan.
 */
export async function callGLM46(opts: CallGLMOptions): Promise<CuratorPlan> {
  const {
    apiKey,
    conversation,
    projectHint,
    goalContext,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = OPENROUTER_BASE,
  } = opts;

  if (!apiKey) throw new Error("openrouter: missing api key");

  const userMessage = [
    projectHint ? `Project: ${projectHint}` : null,
    goalContext ? `Goal context (from the whole session): ${goalContext}` : null,
    "Recent conversation (most recent last):",
    "---",
    conversation.slice(0, 8_000),
    "---",
    "Return the JSON plan now.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter attribution — optional but recommended by their docs.
      "HTTP-Referer": "https://github.com/Manueldav2/idex",
      "X-Title": "IDEX",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: CURATOR_PLAN_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`openrouter: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as OpenRouterChatResponse;
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("openrouter: empty response");

  const plan = coerce(raw);
  return plan;
}

/**
 * Coerce a raw model response into a CuratorPlan. Strips fences, trims
 * arrays, and throws if any required field is missing after cleanup.
 */
function coerce(raw: string): CuratorPlan {
  // Some models wrap JSON in ```json fences despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("openrouter: response was not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("openrouter: response was not an object");
  }

  const obj = parsed as Record<string, unknown>;

  const summary = asString(obj["summary"], "");
  const intent = asString(obj["intent"], summary);
  const directTopics = asStringArray(obj["directTopics"]).slice(0, 5);
  const adjacentTopics = asStringArray(obj["adjacentTopics"]).slice(0, 8);
  const xQueries = asStringArray(obj["xQueries"]).slice(0, 5);

  if (directTopics.length === 0 && xQueries.length === 0) {
    throw new Error("openrouter: plan has no topics or queries");
  }

  return {
    summary: summary || "Working on code",
    intent: intent || "exploring code",
    directTopics,
    adjacentTopics,
    xQueries: xQueries.length > 0 ? xQueries : directTopics,
  };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
