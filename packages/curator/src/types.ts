/**
 * Types internal to the Curator pipeline. Public types live in @idex/types.
 */
import type { ContextEvent } from "@idex/types";

export interface CuratorInput {
  recentEvents: ContextEvent[];
  /** Optional explicit project name / cwd hint to anchor the topic graph. */
  projectHint?: string;
}

export interface CuratorPlan {
  summary: string;
  intent: string;
  directTopics: string[];
  adjacentTopics: string[];
  xQueries: string[];
}
