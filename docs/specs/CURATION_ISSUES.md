# Curator: curation issues & the goal-aware fix

Status: implemented (2026-05). Owner: curator package.

The Curator's promise (README, .impeccable.md) is a feed of *adjacent*
topics that helps what the developer is doing — "not just direct keyword
matches." In practice it was keyword-bound and amnesiac. This doc records
why, and what changed.

## The brief (in the user's words)

> Make sure the content helps what they are doing, not just the keywords.
> If someone has been building an agent for the last month and then says
> "how do I make my agent faster, it's shit", pull up stuff for making
> agents more efficient (agent frameworks, the ecosystem) rather than
> dumping those words into a Twitter search. IDEX should help them learn,
> based on their goal/task and what they're saying *now* — not just the
> most recent thing they said.

## Root-cause issues

1. **Recency bias / amnesia (the headline bug).**
   `feed.ts` only ever passed `session.events.slice(-12)` to the curator,
   and `planFromContext()` planned almost entirely off the *last* user
   prompt. The agent store keeps up to 200 events — the long-horizon goal
   was *available but thrown away*. A month of building an agent was
   invisible the moment the latest message was low-signal.

2. **Frustration / low-signal messages collapsed the plan.**
   "make it faster", "it's shit", "this is broken" — the high-value words
   (`make`, `faster`, `fix`, `want`, `help`) are all stop-words. A
   frustrated optimization request extracted almost nothing and fell
   through to `DEFAULT_AMBIENT_TOPICS` (generic typescript/react/claude).
   The user's actual need was discarded.

3. **Intent was stop-worded instead of mapped to a topic.**
   "faster / slow / optimize / cost / latency" *are* the research need
   (performance), but they were dropped. The curator never translated
   "make my agent faster" into the agent ecosystem's *performance*
   discourse.

4. **Keyword-literal, not conceptual — unless an LLM key was present.**
   The deterministic path echoed the user's literal words. The "adjacent
   topics / help them learn" half only fired with an OpenRouter key, and
   even then single-word ecosystem names (langgraph, crewai, inngest) were
   dropped because the live-query promotion required multi-word topics.

5. **No channel to state a goal.** Nothing could tell the curator "I'm
   building X." It could only guess from the tail.

6. **No evals.** Every fix in `curator.ts` is a comment describing a past
   breakage ("was picking up hey/claude", "Tucker Carlson instead of
   Claude Code"). Nothing guarded against regressions.

## The fix — goal-aware curation

New module `packages/curator/src/goal.ts`:

- **`deriveGoal(events, { prev, statedGoal })`** reads the *whole* session
  (recency-decayed) and finds the topics that *recur across turns* —
  recurrence is the goal signal. The previous goal is folded back in so
  the domain stays sticky across refreshes even as the 12-event window
  slides. Agent-injected tokens (`claude`/`anthropic`/`mcp`) are counted
  only when the user themselves typed them.
- **`detectFacet(latest)`** reads exactly the verbs/adjectives the topic
  extractor throws away and classifies the *current* need: performance,
  debugging, comparison, integration, design, scaffolding, shipping,
  learning. "make it faster, it's shit" → `performance`.
- **`synthesizeGoalQueries(goal)`** crosses domain × facet into conceptual
  queries: goal "ai agents" + facet "performance" →
  `ai agents performance optimization`, `llm agent latency reduction`,
  `reduce llm agent token cost`, `ai agent framework comparison` — the
  ecosystem's efficiency discussion, plus an ecosystem-teaching query.

Wiring:

- `planFromContext()` blends **persistent goal** + **current message**.
  When the latest message is low-signal (or the goal is confident, or a
  goal was stated), it leads with the conceptual goal queries; otherwise
  it leads with the literal current request and keeps the goal queries as
  the teaching tail. `directTopics` = what they're saying now;
  `adjacentTopics` = the goal + stack + ecosystem (so the "teach" half
  holds even with **no** LLM key).
- The LLM planners (`agent-planner.ts`, `openrouter.ts`) receive a
  `goalContext` string so live curation is anchored to the goal too.
- `feed.ts` derives the goal from the **full** `session.events`, keeps it
  sticky across refreshes, and exposes `setStatedGoal()` — the `/goal`
  channel (an explicit goal outranks inference).

## Evals

`packages/curator/src/__evals__/` — 19 scenarios, 76 checks, fully
offline/deterministic against `planFromContext`.

- `pnpm --filter @idex/curator test` — vitest gate (fails CI on regression).
- `pnpm --filter @idex/curator eval` — human-readable scorecard that
  prints the actual queries per scenario so relevance is eyeballable.

Checks encode the brief, not keywords: facet mapping, goal persistence
across a window slide, topic-switch adaptivity, "conceptual not literal
echo", no self-brand / affect-word / single-word-bomb leakage, and the
headline case (month-long agent build + "make it faster, it's shit").
