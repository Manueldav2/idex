/**
 * AutopilotKickoffPrompt — the single long-form prompt we send to the Claude
 * Code session when the user enters a goal in Autopilot mode. The template is
 * intentionally opinionated: the agent is told to plan, execute, research,
 * heartbeat, and report without waiting for permission on trivial decisions.
 *
 * Substitute `{goal}` with the raw user input. We do NOT escape or wrap it —
 * Claude Code handles a plain text goal well, and any transformation would
 * risk distorting the user's intent.
 */

export const AUTOPILOT_KICKOFF_TEMPLATE = `You are running in autopilot mode. The user has given you a single goal and is now watching a contextual feed while you work. Your job:

1. Plan the work in 3 to 6 concrete steps. Write the plan first, clearly.
2. Execute the steps one by one. Explain what you're doing in 1 to 2 sentences before each step.
3. Make decisions yourself when there's an obvious best choice. When genuinely ambiguous, pick a sensible default and flag it as an assumption.
4. Research with web search, read relevant files, verify with tests or builds where practical.
5. After every 2 to 3 steps, give a one-line progress heartbeat like "HEARTBEAT: step 3 of 6, current focus is X."
6. When you're done, write a short summary titled "AUTOPILOT REPORT" with: goal restated, what shipped, decisions made, follow-ups.

Stay in the current working directory. Don't ask for permission on trivial things. The user will inject mid-flight instructions if they want to course-correct — those arrive as plain text between your turns.

GOAL:
{goal}`;

/**
 * Render the kickoff prompt with the user's goal substituted in.
 * Trims the goal so stray leading/trailing whitespace doesn't leak into the
 * rendered template.
 */
export function renderKickoffPrompt(goal: string): string {
  return AUTOPILOT_KICKOFF_TEMPLATE.replace("{goal}", goal.trim());
}
