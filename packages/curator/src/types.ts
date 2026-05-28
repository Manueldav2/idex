/**
 * Types internal to the Curator pipeline. Public types live in @idex/types.
 */
import type { ContextEvent } from "@idex/types";
import type { SessionGoal } from "./goal.js";

export interface CuratorInput {
  /**
   * Recent conversation turns — drives the IMMEDIATE topic signal (what
   * the user is saying right now). Keep this short (~12 events).
   */
  recentEvents: ContextEvent[];
  /**
   * Full session history when available (the agent store keeps up to 200
   * events). Used only to derive the long-horizon goal — recurrence
   * across turns can't be seen in a 12-event window. Falls back to
   * `recentEvents` when omitted.
   */
  allEvents?: ContextEvent[];
  /**
   * A goal already derived for this session. When present we keep it
   * sticky (the curator won't forget the domain just because the latest
   * message was low-signal). When absent the curator derives one.
   */
  goal?: SessionGoal;
  /** Explicit user-stated goal (the `/goal` channel). Highest authority. */
  statedGoal?: string;
  /** Optional explicit project name / cwd hint to anchor the topic graph. */
  projectHint?: string;
}

export interface CuratorPlan {
  summary: string;
  intent: string;
  directTopics: string[];
  adjacentTopics: string[];
  xQueries: string[];
  /**
   * The goal the plan was built against. Echoed back so the call site can
   * persist it across refreshes (stickiness) and render it in the cockpit
   * header. Optional because the LLM-coerced plan may not carry it.
   */
  goal?: SessionGoal;
}
