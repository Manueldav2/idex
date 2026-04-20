import type { AgentAdapter, AdapterDetectionResult } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Codex (OpenAI) CLI adapter — `@openai/codex` (bin: `codex`, v0.118+).
 *
 * Markers confirmed by:
 *   - PTY capture of the interactive TUI (ratatui/crossterm),
 *     `codex --no-alt-screen` from a fresh workspace (2026-04-19).
 *   - Source:
 *       codex-rs/tui/src/bottom_pane/chat_composer.rs — renders `›` chevron
 *         at the composer line (Span::styled("›", …)).
 *       codex-rs/tui/src/status_indicator_widget.rs — prints
 *         `({elapsed} • esc to interrupt)` while streaming.
 *       codex-rs/tui/src/ui_consts.rs — LIVE_PREFIX_COLS=2 gutter.
 *
 * Detection layers:
 *   1. Primary prompt:      a line that starts with `›` after ANSI strip.
 *      The composer places `›` in col 1–2 with LIVE_PREFIX_COLS=2, so an
 *      optional leading space is allowed.
 *   2. Footer model hint:   `gpt-… · NN% left · /path` appears as the
 *      persistent footer only when Codex is back at the composer, NOT
 *      while generating. Strong "idle/done" signal.
 *   3. Secondary (generating-guard): the `esc to interrupt` hint is the
 *      unambiguous "still working" marker — when it's present we
 *      explicitly treat the stream as NOT a boundary (prevents the idle
 *      timer's 350ms window from firing mid-generation when the TUI
 *      happens to go quiet for >350ms while waiting on the model).
 */

// `›` (U+203A) is the composer prompt chevron. Because the TUI redraws via
// cursor-addressed escapes and we ANSI-strip, the chevron may or may not
// land at the start of a text line. Match it either at BOL (with 0-2 cols
// of left gutter) or immediately followed by a placeholder/input character.
// Source: codex-rs/tui/src/bottom_pane/chat_composer.rs (prompt paint path,
// and LIVE_PREFIX_COLS=2 in ui_consts.rs).
const PROMPT_CHEVRON_RE = /(?:^|\n) {0,2}›(?=\s|$)|›(?=[A-Za-z])/;

// Persistent composer footer, e.g. "  gpt-5.4 xhigh · 100% left · /path".
// Source: captured PTY output; only appears while the composer is active
// (i.e. Codex is ready for the next prompt), never mid-generation.
const COMPOSER_FOOTER_RE = /\s·\s\d{1,3}% left\s·\s/;

// The exact status-bar hint from status_indicator_widget.rs
// (`({elapsed} • esc to interrupt)`). While Codex is streaming, this
// string is repainted every ~32ms by the animation frame. We use it to
// *veto* a stale boundary rather than to produce one.
const STREAMING_HINT_RE = /esc\s+to\s+interrupt/gi;

/** Last-index helper that respects the global regex state. */
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

export const codexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "Codex",

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

    // Find the positions of the most recent "still streaming" hint and
    // the most recent "composer idle" hint. A boundary only fires when
    // an idle hint appears *after* any streaming hint in the buffer — so
    // we correctly handle "generating → done" transitions while the
    // idle timer is still armed.
    const streamingAt = lastIndexOf(STREAMING_HINT_RE, cleanBuffer);
    const footerMatch = cleanBuffer.match(
      /\s·\s\d{1,3}% left\s·\s[^\n]*/g,
    );
    const footerAt = footerMatch
      ? cleanBuffer.lastIndexOf(footerMatch[footerMatch.length - 1]!)
      : -1;
    // For the chevron we only care whether any occurrence exists in the
    // buffer — the composer keeps it visible while idle.
    const chevronHit = PROMPT_CHEVRON_RE.test(cleanBuffer);

    const idleSignalAt = Math.max(footerAt, chevronHit ? 0 : -1);
    const stillGenerating = streamingAt > idleSignalAt && streamingAt !== -1;

    // Require enough accumulated output that we're past the first
    // splash frame — prevents a boundary fire on the initial banner
    // paint before Codex has actually reached its input state.
    const longEnough = cleanBuffer.length > 24;

    const userPromptBoundary =
      !stillGenerating && (footerAt >= 0 || chevronHit) && longEnough;
    const agentDoneBoundary = userPromptBoundary;

    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk,
    };
  },

  // Confirmed via `npm view @openai/codex bin` → `{ codex: 'bin/codex.js' }`.
  getCommand() {
    return { cmd: "codex", args: [] };
  },
};

export { PROMPT_CHEVRON_RE, COMPOSER_FOOTER_RE, STREAMING_HINT_RE };
