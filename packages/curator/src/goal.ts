import type { ContextEvent } from "@idex/types";

/**
 * Goal-aware curation.
 *
 * The original curator was anchored to the TAIL of the conversation —
 * `planFromContext()` planned almost entirely off the *last* user prompt,
 * and the call site (feed.ts) only ever handed it `events.slice(-12)`. So
 * a developer who had spent a month building an agent, then typed "how do
 * I make my agent faster, it's shit", got a plan derived from that single
 * low-signal sentence. "make" / "faster" / "fix" / "want" are all
 * stop-words, so the plan collapsed to nothing and the feed fell back to
 * the ambient typescript/react/claude seed. The accumulated goal — WHAT
 * they're building, in WHAT stack — was invisible.
 *
 * This module gives the curator a memory and a sense of intent:
 *
 *   - `deriveGoal()` reads the WHOLE session (recency-decayed) and finds
 *     the topics that *recur across turns*. Recurrence is the goal signal:
 *     the thing you keep coming back to is the thing you're building. This
 *     is sticky, so a low-signal latest message can't erase it.
 *
 *   - It detects the current-message INTENT FACET (performance, debugging,
 *     comparison…) from exactly the verbs/adjectives the keyword extractor
 *     throws away. "faster / slow / it's shit" → performance facet.
 *
 *   - `synthesizeGoalQueries()` crosses the goal DOMAIN with the FACET to
 *     produce conceptual queries — "ai agent latency optimization",
 *     "llm agent cost reduction", "langgraph performance tips" — instead
 *     of dumping the literal "make my agent faster" into search.
 *
 * The net effect: the feed tracks what the user is *doing over time* and
 * what they *need right now*, not just the most recent thing they typed.
 */

export type IntentFacet =
  | "performance"
  | "debugging"
  | "comparison"
  | "integration"
  | "design"
  | "scaffolding"
  | "shipping"
  | "learning";

export interface SessionGoal {
  /**
   * Short conceptual phrase for the long-horizon thing the user is
   * building, e.g. "ai agents", "rag pipeline", "stripe payments". Null
   * when the session hasn't produced enough signal yet.
   */
  domain: string | null;
  /** Recurring high-signal topics across the whole session (decayed). */
  anchorTopics: string[];
  /** Ecosystem/stack terms detected across the session (frameworks, libs). */
  stack: string[];
  /** Explicit goal the user stated (the `/goal` channel). Highest authority. */
  statedGoal: string | null;
  /** What KIND of help the current (latest) message is asking for. */
  facet: IntentFacet | null;
  /** 0..1 confidence in the domain guess. Low = lean on current message. */
  confidence: number;
}

/**
 * Words that are intent/affect, not topics. These are the tokens the main
 * curator stop-list eats — we read them here precisely *because* they
 * carry the user's need ("faster" = performance), then we drop them from
 * the topic pool so "faster" never becomes an anchor topic itself.
 */
const GOAL_STOP = new Set([
  "the","a","an","of","and","or","but","is","are","was","were","be","been",
  "to","from","with","without","for","in","on","at","as","by","this","that",
  "i","me","my","we","you","your","it","its","do","does","did","done","ok",
  "hey","hi","hello","yo","sup","listen","alright","okay","thanks","thank",
  "let","make","made","build","built","fix","fixed","help","need","want",
  "please","try","then","find","show","give","get","got","put","take","run",
  "call","check","see","look","use","using","used","go","add","tell","ask",
  "say","said","know","think","thought","best","better","good","great",
  "why","how","what","where","when","who","out","like","can","will","would",
  "should","could","just","really","maybe","thing","things","stuff","some",
  "any","all","more","most","less","about","into","onto","over","than","also",
  "here","there","now","one","still","already","even","only","very","super",
  "actually","basically","probably","kinda","faster","fast","slow","slower",
  "sluggish","laggy","lag","speed","optimize","optimise","perf","broken",
  "bug","error","errors","crash","stuck","shit","sucks","garbage","terrible",
  "working","work","works",
  // Affect + conversational filler that would otherwise become bogus
  // anchor topics ("ugh hate", "building video", "project honestly").
  "ugh","hate","damn","annoying","awful","building","project","honestly",
  "sure","big","stuff","yeah","nah","hmm","gonna","wanna","lemme","kinda",
]);

/**
 * Tokens the AGENT (Claude) injects into its replies but which rarely
 * represent the user's own research interest. We count them only when the
 * USER actually typed them — otherwise "claude" / "anthropic" / "mcp" leak
 * out of the agent's responses and become the goal, so the feed chases the
 * very tool the user is talking THROUGH instead of what they're building.
 */
const AGENT_CONTEXT_TERMS = new Set(["claude", "anthropic", "mcp"]);

/**
 * Curated ecosystem vocabulary. A token that lands here is a real
 * framework / library / product, which makes it (a) a strong anchor and
 * (b) usable to *qualify* an otherwise-generic domain query.
 */
const ECOSYSTEM_TERMS = new Set([
  // agent frameworks
  "langchain","langgraph","crewai","autogen","autogpt","llamaindex",
  "haystack","mastra","dspy","smolagents","agno","swarm","pydantic-ai",
  // ai coding tools (the "which is better" comparison set)
  "cursor","windsurf","cline","devin","aider","copilot","zed","codeium",
  "bolt","lovable","replit","v0",
  // llm / retrieval infra
  "openai","gpt","gpt-4","gpt-5","claude","anthropic","gemini","mistral",
  "llama","ollama","vllm","groq","together","fireworks","huggingface",
  "transformers","rag","embeddings","embedding","pinecone","weaviate",
  "qdrant","chroma","pgvector","reranker",
  // web frontend
  "react","next","nextjs","remix","svelte","sveltekit","vue","nuxt",
  "astro","solid","angular","vite","turbopack","tailwind","shadcn","radix",
  // backend / data
  "node","deno","express","fastify","hono","trpc","graphql","prisma",
  "drizzle","postgres","postgresql","supabase","firebase","redis","kafka",
  "rabbitmq","mongodb","sqlite",
  // services
  "stripe","twilio","sendgrid","resend","clerk","auth0","cloudflare",
  "vercel","netlify","railway","aws","gcp","lambda",
  // jobs / durable execution
  "inngest","trigger.dev","temporal","bullmq","celery",
  // languages
  "typescript","javascript","python","rust","golang","swift","kotlin",
  "java","ruby","elixir",
]);

/** Self-brand tokens that must never become an anchor or a query. */
const SELF_BRAND = new Set([
  "idex","cockpit","freebuff","moda","trygravity","bun",
]);

/**
 * Generic AI tokens → the conceptual domain they actually imply. Without
 * this, the domain reads "agent" (matches FBI/ICE/travel agents); with it,
 * the domain reads "ai agents" and every synthesized query inherits the
 * disambiguating frame.
 */
const GENERIC_DOMAIN_MAP: Record<string, string> = {
  agent: "ai agents",
  agents: "ai agents",
  agentic: "ai agents",
  rag: "rag pipeline",
  llm: "llm apps",
  llms: "llm apps",
  embedding: "vector search",
  embeddings: "vector search",
  prompt: "prompt engineering",
  prompts: "prompt engineering",
  mcp: "mcp servers",
  chatbot: "ai chatbots",
  copilot: "ai copilots",
};

/**
 * Current-message intent signals. Matched against the latest user message
 * only — this is "what do they want help with *right now*", which layers
 * on top of the persistent goal. Order is priority order: the first facet
 * with any match wins ties, so the specific intents (performance,
 * debugging) beat the catch-all "learning".
 */
const FACET_SIGNALS: Array<{ facet: IntentFacet; re: RegExp }> = [
  {
    facet: "performance",
    re: /\b(faster|fast|slow|slower|sluggish|laggy|\blag\b|latency|speed|speedup|optimi[sz]e|optimi[sz]ation|perf|performance|throughput|bottleneck|expensive|cheaper|token usage|too long|takes forever|efficien\w*|memory leak)\b|it'?s shit|\bsucks\b|garbage|too slow/i,
  },
  {
    facet: "debugging",
    re: /\b(bug|buggy|broken|breaks?|error|errors|fails?|failing|crash\w*|exception|stack ?trace|not working|doesn'?t work|won'?t work|undefined|race condition|flaky|hangs?|stuck|infinite loop|regression)\b/i,
  },
  {
    facet: "comparison",
    re: /\b(best|better|vs\.?|versus|compare|comparison|alternatives?|which one|which is|should i use|recommend\w*|instead of|migrate from|switch from|or should)\b/i,
  },
  {
    facet: "integration",
    re: /\b(integrat\w+|connect\w*|webhooks?|oauth|sdk|wire up|hook up|plug in|set up (?:stripe|twilio|auth|clerk|supabase)|callback url)\b/i,
  },
  {
    facet: "design",
    re: /\b(ui|ux|design|layout|styling|css|responsive|animation|theme|color|typography|figma|component library|spacing)\b/i,
  },
  {
    facet: "scaffolding",
    re: /\b(scaffold\w*|boilerplate|starter|new project|from scratch|initiali[sz]e|bootstrap|get started|project structure|monorepo setup)\b/i,
  },
  {
    facet: "shipping",
    re: /\b(deploy\w*|ship\b|production|prod\b|release|ci\/?cd|docker|kubernetes|k8s|hosting|vercel deploy|fly\.io|railway)\b/i,
  },
  {
    facet: "learning",
    re: /\b(how do|how to|how can|how should|what is|what are|explain|understand|learn|tutorial|guide|example|why does|difference between)\b/i,
  },
];

function stripGreetingAddress(text: string): string {
  return text.replace(
    /^\s*(?:hey|hi|hello|yo|sup|listen)\s+\w+([\s,;:.\-]+|$)/i,
    "",
  );
}

function contentTokens(text: string): string[] {
  const toks = text.toLowerCase().match(/[a-z][a-z0-9_.+-]{2,}/g) ?? [];
  return toks.filter(
    (t) => !GOAL_STOP.has(t) && !SELF_BRAND.has(t) && t.length >= 3,
  );
}

/** Detect the current-message facet from the latest user message. */
export function detectFacet(latestUserText: string | null): IntentFacet | null {
  if (!latestUserText) return null;
  let bestFacet: IntentFacet | null = null;
  let bestCount = 0;
  let bestPri = Number.POSITIVE_INFINITY;
  for (let pri = 0; pri < FACET_SIGNALS.length; pri += 1) {
    const { facet, re } = FACET_SIGNALS[pri];
    const m = latestUserText.match(new RegExp(re.source, `${re.flags}g`));
    const count = m ? m.length : 0;
    if (count === 0) continue;
    // Higher match count wins; lower priority index breaks ties (the
    // specific facets sit above the catch-all "learning").
    if (count > bestCount || (count === bestCount && pri < bestPri)) {
      bestFacet = facet;
      bestCount = count;
      bestPri = pri;
    }
  }
  return bestFacet;
}

/** Map a raw anchor topic to a conceptual domain phrase. */
function canonicalizeDomain(anchors: string[], stack: string[]): string | null {
  if (anchors.length === 0) return null;
  const top = anchors[0];
  const mapped = GENERIC_DOMAIN_MAP[top];
  if (mapped) return mapped;
  // Two concrete anchors that read naturally together (e.g. "stripe
  // webhooks", "next router") make a sharper domain than one alone.
  if (anchors.length >= 2 && !GENERIC_DOMAIN_MAP[anchors[1]]) {
    const pair = `${anchors[0]} ${anchors[1]}`;
    if (pair.length <= 28) return pair;
  }
  // A bare ecosystem term is already a fine domain ("tailwind", "prisma").
  if (ECOSYSTEM_TERMS.has(top) || stack.includes(top)) return top;
  return top;
}

export interface DeriveGoalOptions {
  /** Previous goal to keep the anchor sticky across refreshes. */
  prev?: SessionGoal | null;
  /** Explicit user-stated goal (the `/goal` channel). */
  statedGoal?: string | null;
}

/**
 * Build a SessionGoal from the full event history. Pass as MANY events as
 * you have (the agent store keeps up to 200) — recurrence across turns is
 * the whole point, and a 12-event window is too short to see it.
 */
export function deriveGoal(
  events: ContextEvent[],
  opts: DeriveGoalOptions = {},
): SessionGoal {
  const statedGoal = opts.statedGoal?.trim() || null;

  const textEvents = events.filter(
    (e): e is Extract<ContextEvent, { text: string }> =>
      (e.kind === "user_input" ||
        e.kind === "agent_done" ||
        e.kind === "agent_chunk") &&
      "text" in e,
  );

  const latestUser = [...events]
    .reverse()
    .find((e): e is Extract<ContextEvent, { kind: "user_input" }> =>
      e.kind === "user_input" && "text" in e,
    );
  const facet = detectFacet(latestUser ? latestUser.text : null);

  // Score every content token: weight by recency (newest turn = 1.0,
  // older turns decay) and by role (the user's own words outweigh the
  // agent's). Track which turns each token appeared in so we can reward
  // RECURRENCE — the term you keep returning to is the goal.
  const DECAY = 0.88;
  const N = textEvents.length;
  const score = new Map<string, number>();
  const turnsSeen = new Map<string, Set<number>>();

  // Vocabulary the USER actually typed — used to gate agent-context terms
  // (claude / anthropic / mcp) so the agent's own replies can't make the
  // tool the user is talking THROUGH look like the thing they're building.
  const userTokens = new Set<string>();
  for (const e of textEvents) {
    if (e.kind !== "user_input") continue;
    for (const tok of contentTokens(stripGreetingAddress(e.text))) {
      userTokens.add(tok);
    }
  }

  textEvents.forEach((e, i) => {
    const isUser = e.kind === "user_input";
    const recency = Math.pow(DECAY, N - 1 - i);
    const roleWeight = isUser ? 1 : 0.4;
    const text = isUser ? stripGreetingAddress(e.text) : e.text;
    for (const tok of new Set(contentTokens(text))) {
      // Skip claude/anthropic/mcp unless the user themselves typed it.
      if (AGENT_CONTEXT_TERMS.has(tok) && !userTokens.has(tok)) continue;
      const bonus = ECOSYSTEM_TERMS.has(tok) ? 1.5 : 1;
      score.set(tok, (score.get(tok) ?? 0) + recency * roleWeight * bonus);
      const seen = turnsSeen.get(tok) ?? new Set<number>();
      seen.add(i);
      turnsSeen.set(tok, seen);
    }
  });

  // Recurrence multiplier: a token spanning multiple turns is the
  // through-line of the session. This is what makes the goal survive a
  // low-signal latest message.
  for (const [tok, turns] of turnsSeen) {
    if (turns.size >= 2) {
      score.set(tok, (score.get(tok) ?? 0) * (1 + 0.5 * turns.size));
    }
  }

  // Fold the previous goal's anchors back in so the goal is sticky across
  // refreshes even as the 12-event window slides past the early turns
  // where the domain was first established.
  if (opts.prev) {
    opts.prev.anchorTopics.forEach((tok, idx) => {
      const decayPrev = 0.9 - idx * 0.05;
      score.set(tok, (score.get(tok) ?? 0) + Math.max(0.2, decayPrev));
    });
  }

  const ranked = Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tok]) => tok);

  const anchorTopics = ranked.slice(0, 6);
  // When the user has stated a goal explicitly, the domain AND the stack
  // qualifier come from THAT, not from whatever ecosystem term happened to
  // appear in an off-topic aside ("what to do next" must not make Next.js
  // the stack of a video-API goal).
  const statedTokens = statedGoal ? contentTokens(statedGoal) : [];
  const stack = (statedGoal ? statedTokens : ranked)
    .filter((t) => ECOSYSTEM_TERMS.has(t))
    .slice(0, 4);
  const domain = statedGoal
    ? canonicalizeDomain(statedTokens, stack) ?? statedTokens[0] ?? null
    : canonicalizeDomain(anchorTopics, stack);

  // Confidence: how concentrated is the signal, and is it backed by
  // recurrence? A single mention of one word = low; the same domain over
  // many turns = high.
  const topScore = ranked.length ? (score.get(ranked[0]) ?? 0) : 0;
  const recurringCount = Array.from(turnsSeen.values()).filter(
    (s) => s.size >= 2,
  ).length;
  const confidence = statedGoal
    ? 1
    : Math.max(0, Math.min(1, topScore / 4 + recurringCount * 0.15));

  return { domain, anchorTopics, stack, statedGoal, facet, confidence };
}

function isAgentish(domain: string): boolean {
  return /\bagent|agentic|llm|rag\b/i.test(domain);
}

/**
 * Cross the goal domain with the current facet to synthesize conceptual
 * queries. This is the step that turns "make my agent faster, it's shit"
 * into the ecosystem's *performance* discourse rather than a literal
 * search of the user's sentence.
 */
export function synthesizeGoalQueries(goal: SessionGoal): string[] {
  // Prefer the short canonical domain — the raw statedGoal string is a
  // full sentence and would blow past the 60-char query cap, dropping
  // every synthesized query.
  const domain = (goal.domain || goal.statedGoal || "").trim();
  if (!domain) return [];
  const stack0 = goal.stack[0];
  const agentish = isAgentish(domain);
  const out: string[] = [];

  switch (goal.facet) {
    case "performance":
      out.push(`${domain} performance optimization`);
      out.push(agentish ? "llm agent latency reduction" : `${domain} latency`);
      out.push(stack0 ? `${stack0} performance tips` : `${domain} speed`);
      if (agentish) out.push("reduce llm agent token cost");
      else out.push(`${domain} benchmarks`);
      break;
    case "debugging":
      out.push(`${domain} common pitfalls`);
      out.push(stack0 ? `${stack0} gotchas` : `${domain} error handling`);
      out.push(agentish ? "ai agent failure modes" : `${domain} debugging`);
      break;
    case "comparison":
      out.push(`best ${domain} 2026`);
      if (agentish) {
        out.push("langgraph vs crewai");
        out.push("ai agent framework comparison");
      } else {
        out.push(`${domain} comparison`);
        out.push(stack0 ? `${stack0} alternatives` : `${domain} benchmarks`);
      }
      break;
    case "integration":
      out.push(`${domain} integration patterns`);
      out.push(stack0 ? `${stack0} ${domain} guide` : `${domain} api best practices`);
      out.push(`${domain} webhook reliability`);
      break;
    case "design":
      out.push(`${domain} ui patterns`);
      out.push(stack0 ? `${stack0} design system` : `${domain} ux best practices`);
      break;
    case "scaffolding":
      out.push(`${domain} project structure`);
      out.push(stack0 ? `${stack0} starter template` : `${domain} boilerplate 2026`);
      out.push(`${domain} architecture`);
      break;
    case "shipping":
      out.push(`deploy ${domain} production`);
      out.push(`${domain} production checklist`);
      out.push(stack0 ? `${stack0} deployment guide` : `${domain} observability`);
      break;
    case "learning":
    default:
      out.push(`${domain} best practices`);
      out.push(`${domain} architecture patterns`);
      if (agentish) out.push("building reliable ai agents");
      else if (stack0) out.push(`${stack0} advanced patterns`);
      break;
  }

  // Always teach the wider ecosystem, not just the immediate task — this
  // is the "help them learn" half of the brief.
  if (agentish && goal.facet !== "comparison") {
    out.push("ai agent framework comparison");
  }

  return out
    .map((q) => q.trim())
    .filter((q) => q.split(/\s+/).length >= 2 && q.length <= 60);
}

/**
 * Human-readable goal context injected into the LLM planners' prompts so
 * live curation is anchored to the long-horizon goal, not just the tail.
 */
export function goalContextString(goal: SessionGoal): string | null {
  const parts: string[] = [];
  if (goal.statedGoal) parts.push(`Stated goal: ${goal.statedGoal}.`);
  if (goal.domain) parts.push(`Long-running goal (from the whole session): building ${goal.domain}.`);
  if (goal.stack.length) parts.push(`Stack in play: ${goal.stack.join(", ")}.`);
  if (goal.facet) parts.push(`Right now they need help with: ${goal.facet}.`);
  if (parts.length === 0) return null;
  parts.push(
    "Bias the queries toward this goal and the help they need now, even if the latest message is short, vague, or just frustration.",
  );
  return parts.join(" ");
}
