import type { AgentAdapter, AdapterDetectionResult } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Freebuff CLI placeholder adapter.
 * Wired in Phase 3 — for v1.0 we only ship Claude Code.
 *
 * Freebuff's TUI as of 2026-04 uses an arrow-style prompt: `freebuff →`.
 * Confirm with fixture capture before going live.
 */
const PROMPT_LINE_RE = /^freebuff\s*[→>]\s*$/m;

export const freebuffAdapter: AgentAdapter = {
  id: "freebuff",
  displayName: "Freebuff",

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
    return { cmd: "freebuff", args: [] };
  },
};
