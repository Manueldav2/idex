import type { ContextEvent } from "@idex/types";

/**
 * Agent-driven query planner.
 *
 * The naive token-extractor in `curator.ts` is mechanical — it looks at
 * the tail of the conversation, pulls tokens, and hopes the result set
 * is relevant. For anything beyond "fix this bug" it's thin.
 *
 * This planner asks an LLM: *given what the user is actually doing,
 * what 4 queries would surface the most useful tweets?* The model is
 * told about the workspace, the last few turns, and the rule that each
 * query has to be a natural-language thing a developer would actually
 * type into X search. Output is strict JSON.
 *
 * We use OpenRouter because the user already has a keychain slot for
 * it, and the `google/gemini-2.5-flash` model is fast (~500-800ms),
 * cheap, and follows JSON-schema prompts reliably.
 */

export interface AgentPlanResult {
  queries: string[];
  /** Short 1-line rationale for logs / curator header. */
  reason: string;
}

interface PlannerInput {
  /** Last handful of conversation turns — user prompts and agent chunks. */
  recentEvents: ContextEvent[];
  /** Workspace folder name ("paradigm", "idex-desktop", etc). */
  projectHint?: string;
  /** OpenRouter API key (from the OS keychain). */
  openRouterKey: string;
  /** Model id. Defaults to Gemini Flash for cost+speed. */
  model?: string;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are IDEX's feed curator. You look at what a developer is working on and return 4 short search queries that would surface the most useful tweets, discussions, or blog posts on X (Twitter).

Rules:
- Each query is 2–6 words.
- Queries must be a natural phrase a developer would type — not a list of tokens. "claude code skills" ✓, "claude AND skills AND code" ✗.
- Prefer specificity over breadth: "next.js app router cache revalidation" ✓, "next.js" ✗.
- Mix one or two queries about the specific thing the user just asked, and one or two about the surrounding problem space.
- No hashtags, no quotes in the queries themselves — the downstream system handles phrase quoting.
- If the conversation is empty or ambient, return 4 queries about the project's technology stack inferred from the workspace name.

Return strict JSON: { "queries": ["q1","q2","q3","q4"], "reason": "one short sentence" }.
No prose, no markdown, no code fences.`;

export async function planQueriesWithAgent(
  input: PlannerInput,
): Promise<AgentPlanResult | null> {
  if (!input.openRouterKey) return null;

  // Condense the recent events into a compact transcript the model can
  // read in one shot. Ignore everything except user prompts and the
  // agent's final replies — mid-generation chunks are redundant and
  // eat tokens.
  const transcript = buildTranscript(input.recentEvents);
  const userMessage = [
    input.projectHint ? `Project: ${input.projectHint}` : "",
    transcript ? `Recent turns:\n${transcript}` : "No conversation yet — ambient feed.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://idex.dev",
        "X-Title": "IDEX Curator",
      },
      body: JSON.stringify({
        model: input.model ?? DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      queries?: unknown;
      reason?: unknown;
    };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter((q) => q.length >= 3 && q.length <= 80)
          .slice(0, 4)
      : [];
    if (queries.length === 0) return null;

    return {
      queries,
      reason: typeof parsed.reason === "string" ? parsed.reason : "agent-planned",
    };
  } catch {
    // Network failure, JSON parse failure, model hiccup — all fall
    // through to the naive planner. Never block the feed on a third
    // party.
    return null;
  }
}

function buildTranscript(events: ContextEvent[]): string {
  // Keep the last ~6 semantic events. Agent chunks are coalesced to
  // their `agent_done` finals when available.
  const rows: string[] = [];
  for (const e of events.slice(-12)) {
    if (e.kind === "user_input" && "text" in e) {
      rows.push(`user: ${truncate(e.text, 200)}`);
    } else if (e.kind === "agent_done" && "text" in e) {
      rows.push(`assistant: ${truncate(e.text, 240)}`);
    }
  }
  return rows.slice(-6).join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
