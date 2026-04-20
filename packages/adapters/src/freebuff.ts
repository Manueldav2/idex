import type { AgentAdapter, AdapterDetectionResult } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Freebuff CLI adapter — `freebuff` (Codebuff free variant).
 *
 * npm: `freebuff` (v0.0.40 at time of writing).
 *    `npm view freebuff bin` → `{ freebuff: 'index.js' }`
 *    (i.e. the user-facing shell command is `freebuff`).
 *
 * Freebuff ships the same React/Ink (opentui) codebase as Codebuff with
 * `IS_FREEBUFF=true` gating the branding/session-limit UI. Prompt markers
 * were derived from the public source at github.com/CodebuffAI/codebuff:
 *
 *   - cli/src/components/chat-input-bar.tsx — renders a bordered box
 *     (BORDER_CHARS: ╭ ─ ╮ │ ╰ ╯) around a MultilineInput. No fixed
 *     prompt glyph; placeholder is the main textual signature:
 *        default mode → "enter a coding task or / for commands"
 *        (cli/src/utils/input-modes.ts)
 *   - cli/src/components/status-bar.tsx — streaming/thinking indicators:
 *        'thinking...' | 'working...'   (streaming / waiting on LLM)
 *        'Free session · …'             (idle, at composer)
 *        'Press Ctrl-C again to exit'   (ctrl-c confirm prompt)
 *        'Reconnected' | 'retrying...' | 'connecting...'
 *   - cli/src/app.tsx line ~229 — opening banner:
 *        "Freebuff will run commands on your behalf to help you build."
 *
 * Detection layers:
 *   1. Primary idle signal:  the default composer placeholder string —
 *      Ink always re-paints the placeholder when the input box is empty
 *      and focused, i.e. right after the agent finishes a turn.
 *   2. Secondary idle signal: "Free session · " appears in the status bar
 *      exclusively during the idle state (see StatusBar switch, case 'idle').
 *   3. Generating veto:       if 'thinking...' or 'working...' is in the
 *      recent buffer, the model is still streaming — don't emit a boundary
 *      even if the 350ms idle timer would otherwise fire.
 *
 * The Codebuff source wasn't fully inspectable by running the binary
 * (not installed on this machine), so everything above is derived from
 * the open-source repo files cited. TODO: capture a real PTY transcript
 * once freebuff is installable in CI to tighten the regexes further.
 */

// Placeholder text for the 'default' input mode — authoritative from
// INPUT_MODE_CONFIGS.default.placeholder in cli/src/utils/input-modes.ts.
const DEFAULT_PLACEHOLDER_RE = /enter a coding task or \/ for commands/i;

// Status bar "idle" readout. Source: status-bar.tsx, case 'idle'.
const IDLE_STATUS_RE = /Free session\s*·/i;

// Status bar "currently working" markers. We use these to *veto* a
// boundary, not to emit one, so shimmer animation flicker doesn't race
// with the agent-host's 350ms idle window.
const STREAMING_HINT_RE = /(thinking\.\.\.|working\.\.\.|retrying\.\.\.|connecting\.\.\.)/i;

// Startup banner — useful to distinguish the first paint (pre-idle)
// from a completed turn.
const BANNER_RE = /Freebuff\s+will\s+run\s+commands/i;

/** Last-index helper that respects global-regex state. */
function lastIndexOf(re: RegExp, s: string): number {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  let last = -1;
  while ((match = re.exec(s)) !== null) {
    last = match.index;
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return last;
}

// Global variants so we can find the *last* occurrence per chunk —
// important for correctly ordering "streaming → idle" transitions.
const STREAMING_HINT_GRE =
  /(thinking\.\.\.|working\.\.\.|retrying\.\.\.|connecting\.\.\.)/gi;
const DEFAULT_PLACEHOLDER_GRE = /enter a coding task or \/ for commands/gi;
const IDLE_STATUS_GRE = /Free session\s*·/gi;

export const freebuffAdapter: AgentAdapter = {
  id: "freebuff",
  displayName: "Freebuff",

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

    const streamingAt = lastIndexOf(STREAMING_HINT_GRE, cleanBuffer);
    const placeholderAt = lastIndexOf(DEFAULT_PLACEHOLDER_GRE, cleanBuffer);
    const idleStatusAt = lastIndexOf(IDLE_STATUS_GRE, cleanBuffer);
    const idleAt = Math.max(placeholderAt, idleStatusAt);

    // Treat "streaming" as active only if a hint appears *after* the
    // most recent idle signal — prevents a stale "thinking..." from an
    // earlier turn from vetoing a legitimate boundary.
    const stillGenerating = streamingAt > idleAt && streamingAt !== -1;

    // Avoid tripping on the opening banner before the composer is really
    // ready — require at least one of: the placeholder OR the "Free
    // session" status line, AND some buffered content beyond the banner.
    const longEnough = cleanBuffer.length > 32;

    const userPromptBoundary = !stillGenerating && idleAt >= 0 && longEnough;

    // Freebuff doesn't draw a distinct "done-but-waiting" vs "ready for
    // next input" state — the same idle signals cover both.
    const agentDoneBoundary = userPromptBoundary;

    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk,
    };
  },

  // Confirmed via `npm view freebuff bin` → `{ freebuff: 'index.js' }`.
  getCommand() {
    return { cmd: "freebuff", args: [] };
  },
};

export {
  DEFAULT_PLACEHOLDER_RE,
  IDLE_STATUS_RE,
  STREAMING_HINT_RE,
  BANNER_RE,
};
