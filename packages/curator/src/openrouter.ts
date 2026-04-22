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
const MODEL = "z-ai/glm-4.6";
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

const SYSTEM_PROMPT = `You are IDEX's Curator. You read a developer's most recent prompts to their coding agent, then produce a JSON plan describing what they're working on and what *adjacent* topics would be useful to surface in a contextual feed.

Rules:
- "directTopics" = precise keywords from the conversation (max 5, 1-3 words each).
- "adjacentTopics" = related topics that are NOT in the prompt but a senior engineer would think of (max 8). Be creative but stay practical.
- "xQueries" = 3-5 search queries suitable for Twitter/X. Short, concrete, no quotes.
- "summary" = one short sentence about what they're doing.
- "intent" = one short phrase (5-10 words).
- Never include secrets, code, or PII from the prompt in the output.
- Output must match the schema exactly. No prose, no markdown.`;

export interface CallGLMOptions {
  apiKey: string;
  conversation: string;
  projectHint?: string;
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
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = OPENROUTER_BASE,
  } = opts;

  if (!apiKey) throw new Error("openrouter: missing api key");

  const userMessage = [
    projectHint ? `Project: ${projectHint}` : null,
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
