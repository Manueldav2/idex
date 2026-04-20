import type { AgentAdapter, AdapterDetectionResult } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Codex (OpenAI) CLI placeholder adapter.
 * Wired in Phase 2 — for v1.0 we only ship Claude Code.
 *
 * Replace the regexes once the actual Codex CLI prompt markers are confirmed
 * via fixture capture (`docs/plans/.../adapter-fixtures.md`).
 */
const PROMPT_LINE_RE = /^codex\s*[>›]\s*$/m;

export const codexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "Codex",

  detect({ rawChunk, bufferedSinceLastBoundary }: {
    rawChunk: string;
    bufferedSinceLastBoundary: string;
    ts: number;
  }): AdapterDetectionResult {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);
    const boundary = PROMPT_LINE_RE.test(cleanBuffer);
    return {
      userPromptBoundary: boundary,
      agentDoneBoundary: boundary,
      cleanText: cleanChunk,
    };
  },

  getCommand() {
    return { cmd: "codex", args: [] };
  },
};
