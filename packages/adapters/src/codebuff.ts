import type { AgentAdapter, AdapterDetectionResult } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Codebuff CLI adapter — `codebuff` (paid Codebuff variant).
 *
 * Codebuff and Freebuff share the same React/Ink (opentui) codebase.
 * Branding/session-limit UI is gated by the IS_FREEBUFF env. Detection
 * markers come from the same source files referenced in `freebuff.ts`:
 *   - cli/src/components/chat-input-bar.tsx (composer)
 *   - cli/src/components/status-bar.tsx (state hints)
 *
 * Differences from Freebuff:
 *   - The status bar reads "Codebuff · …" instead of "Free session · …"
 *     when idle (status-bar.tsx, case 'idle' branches on IS_FREEBUFF).
 *   - The composer placeholder text is the same.
 *
 * If the user's Codebuff binary outputs the Free-session text (e.g. on
 * trial / unauthenticated state), the freebuff regexes still match — we
 * accept either as the idle signal so the adapter is robust during
 * sign-in transitions.
 */

const DEFAULT_PLACEHOLDER_RE = /enter a coding task or \/ for commands/i;
const IDLE_STATUS_RE = /(Codebuff|Free session)\s*·/i;
const STREAMING_HINT_RE = /\b(thinking|working)\.\.\./i;
const CTRLC_CONFIRM_RE = /Press\s+Ctrl-C\s+again\s+to\s+exit/i;

export const codebuffAdapter: AgentAdapter = {
  id: "codebuff",
  displayName: "Codebuff",

  detect({
    rawChunk,
    bufferedSinceLastBoundary,
  }: {
    rawChunk: string;
    bufferedSinceLastBoundary: string;
    ts: number;
  }): AdapterDetectionResult {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);

    const stillGenerating = STREAMING_HINT_RE.test(cleanBuffer);

    const idleHit =
      DEFAULT_PLACEHOLDER_RE.test(cleanBuffer) ||
      IDLE_STATUS_RE.test(cleanBuffer);

    const longEnough = cleanBuffer.length > 24;
    const userPromptBoundary =
      !stillGenerating && idleHit && longEnough && !CTRLC_CONFIRM_RE.test(cleanBuffer);
    const agentDoneBoundary = userPromptBoundary;

    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk,
    };
  },

  // `npm view codebuff bin` → `{ codebuff: 'index.js' }`.
  getCommand() {
    return { cmd: "codebuff", args: [] };
  },
};
