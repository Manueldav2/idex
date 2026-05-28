/**
 * Curator evals as a vitest gate. `pnpm --filter @idex/curator test`
 * (or `vitest run`) fails CI the moment a curation regression sneaks in —
 * the same failure mode every comment in curator.ts is a war story about
 * ("was picking up hey/claude", "Tucker Carlson instead of Claude Code").
 *
 * The human-readable scored report lives in ./report.ts (`pnpm eval`).
 */
import { describe, expect, it } from "vitest";
import { scenarios, probe } from "./scenarios.js";

describe("curator goal-aware planning", () => {
  for (const scenario of scenarios) {
    describe(`[${scenario.category}] ${scenario.name}`, () => {
      const p = probe(scenario);
      for (const check of scenario.checks) {
        it(check.label, () => {
          // Surface the actual plan on failure so debugging is one read.
          expect(
            check.pass(p),
            `${check.label}\n  queries: ${JSON.stringify(p.queries)}\n  domain: ${p.domain}\n  facet: ${p.facet}\n  topics: ${JSON.stringify(p.topics)}`,
          ).toBe(true);
        });
      }
    });
  }
});
