import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeCodeAdapter } from "../src/claude-code.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load a raw PTY capture from the fixtures directory. */
function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "__fixtures__", name), "utf8");
}

/**
 * Helper that mirrors how `agent-host` calls `detect()` in production: the
 * "raw chunk" is usually the tail of the buffer (the most recent PTY write)
 * and the "buffered since last boundary" is everything since the previous
 * boundary fire.
 */
function runDetect(buf: string) {
  return claudeCodeAdapter.detect({
    rawChunk: buf,
    bufferedSinceLastBoundary: buf,
    ts: Date.now(),
  });
}

describe("claudeCodeAdapter.detect", () => {
  it("fires a prompt boundary on the initial `> ` composer", () => {
    const res = runDetect(fixture("claude-code-idle.txt"));
    expect(res.userPromptBoundary).toBe(true);
    expect(res.agentDoneBoundary).toBe(true);
  });

  it("does NOT fire a boundary while Claude is still generating", () => {
    const res = runDetect(fixture("claude-code-generating.txt"));
    // The TUI shows "Press Esc to interrupt" — no lonely `> ` line yet, so
    // the prompt-line regex must not match.
    expect(res.userPromptBoundary).toBe(false);
  });

  it("fires a done boundary when the composer returns after streaming", () => {
    const res = runDetect(fixture("claude-code-agent-done.txt"));
    expect(res.userPromptBoundary).toBe(true);
    expect(res.agentDoneBoundary).toBe(true);
  });

  it("works after ANSI color escapes are stripped", () => {
    const res = runDetect(fixture("claude-code-ansi-prompt.txt"));
    expect(res.userPromptBoundary).toBe(true);
    expect(res.agentDoneBoundary).toBe(true);
  });

  it("ignores partial banners shorter than the minimum buffer size", () => {
    const res = runDetect(fixture("claude-code-short-banner.txt"));
    expect(res.userPromptBoundary).toBe(false);
    // Banner may be present but short — done boundary must still be false
    // because we haven't seen enough output to trust the state.
    expect(res.agentDoneBoundary).toBe(false);
  });

  it("returns the ANSI-stripped clean text", () => {
    const res = runDetect(fixture("claude-code-ansi-prompt.txt"));
    expect(res.cleanText).not.toMatch(/\u001b\[/);
    expect(res.cleanText).toContain("Error: cannot reach");
  });
});
