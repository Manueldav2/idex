/**
 * Curator eval scorecard. Runs every scenario through the deterministic
 * planner and prints a per-scenario pass/fail breakdown plus the actual
 * queries the curator would fire — so you can eyeball relevance, not just
 * the boolean.
 *
 *   pnpm --filter @idex/curator eval
 *
 * Exit code is non-zero if any check fails, so it doubles as a gate.
 */
import { scenarios, probe, type Scenario, type PlanProbe } from "./scenarios.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function runOne(s: Scenario): { probe: PlanProbe; passed: number; failed: string[] } {
  const p = probe(s);
  const failed: string[] = [];
  let passed = 0;
  for (const c of s.checks) {
    if (c.pass(p)) passed += 1;
    else failed.push(c.label);
  }
  return { probe: p, passed, failed };
}

let totalChecks = 0;
let totalPassed = 0;
const failingScenarios: string[] = [];

for (const category of ["regular", "edge"] as const) {
  const group = scenarios.filter((s) => s.category === category);
  console.log(`\n${BOLD}${category.toUpperCase()} USE${RESET}  ${DIM}(${group.length} scenarios)${RESET}`);
  console.log("─".repeat(72));

  for (const s of group) {
    const { probe: p, passed, failed } = runOne(s);
    totalChecks += s.checks.length;
    totalPassed += passed;
    const ok = failed.length === 0;
    if (!ok) failingScenarios.push(s.name);

    const badge = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`\n${badge}  ${BOLD}${s.name}${RESET}  ${DIM}${passed}/${s.checks.length}${RESET}`);
    console.log(`      ${DIM}${s.note}${RESET}`);
    const facet = p.facet ? `facet=${p.facet}` : "facet=–";
    const domain = p.domain ? `domain="${p.domain}"` : "domain=–";
    console.log(`      ${DIM}${domain}  ${facet}${RESET}`);
    console.log(`      ${DIM}queries:${RESET} ${p.queries.length ? p.queries.join(" · ") : `${DIM}(empty → ambient feed)${RESET}`}`);
    for (const f of failed) console.log(`      ${RED}✗ ${f}${RESET}`);
  }
}

const pct = totalChecks ? Math.round((totalPassed / totalChecks) * 100) : 0;
console.log(`\n${"═".repeat(72)}`);
console.log(
  `${BOLD}SCORE${RESET}  ${totalPassed}/${totalChecks} checks (${pct}%)  across ${scenarios.length} scenarios`,
);
if (failingScenarios.length) {
  console.log(`${RED}Failing scenarios:${RESET} ${failingScenarios.join(", ")}`);
  process.exit(1);
} else {
  console.log(`${GREEN}All scenarios pass.${RESET}`);
}
