import type {
  AgentAdapter,
  AdapterDetectionResult,
} from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Claude Code TUI prompt boundaries:
 *   - User prompt indicator typically appears as a `>` glyph after the
 *     agent finishes streaming. Markers we look for in priority order:
 *       1. A line that exactly matches `^> ?$` after agent output settles
 *       2. The string "Press Esc to interrupt"
 *   - Done boundary is the same as "user prompt re-appears", OR a 300ms
 *     idle timeout enforced by the host (not this adapter).
 *
 * Rationale for being lenient: Claude Code's TUI has shipped multiple
 * revisions; we conservatively match a couple of strong signals and rely
 * on the idle fallback for everything else.
 */
/**
 * Claude Code v2.x renders its input prompt as `›` (U+203A), usually on its
 * own line with nothing but optional whitespace after it. The older `>`
 * fallback stays in case the TUI changes again. We also allow for the box
 * chars the prompt is sometimes framed with.
 */
const PROMPT_LINE_RE = /^\s*[›>](\s*|$)/m;
const ALT_PROMPT_HINT = /Press\s+Esc\s+to\s+interrupt/i;
const ASSISTANT_BANNER_RE = /(╭|━){4,}/;

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
  displayName: "Claude Code",

  detect({ rawChunk, bufferedSinceLastBoundary }: {
    rawChunk: string;
    bufferedSinceLastBoundary: string;
    ts: number;
  }): AdapterDetectionResult {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);

    const userPromptBoundary =
      PROMPT_LINE_RE.test(cleanBuffer) && cleanBuffer.length > 4;

    const agentDoneBoundary =
      userPromptBoundary || (cleanBuffer.length > 16 && ASSISTANT_BANNER_RE.test(cleanBuffer));

    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk,
    };
  },

  getCommand() {
    // --dangerously-skip-permissions: kill the "Do you want to
    // proceed? Yes/No" prompts that break the feed/terminal flow. The
    // user is already running IDEX in their own workspace, which they
    // picked, and IDEX's whole model is "the agent does the work,
    // you read the feed" — stopping to confirm every bash command
    // shatters that loop. Paired with the filesystem sandboxing most
    // projects already have (git, devcontainer, etc.), this is the
    // right default for an IDE built around a coding agent.
    return { cmd: "claude", args: ["--dangerously-skip-permissions"] };
  },
};

export { ALT_PROMPT_HINT, PROMPT_LINE_RE };
