import type { AgentAdapter, AgentId } from "@idex/types";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { freebuffAdapter } from "./freebuff.js";

const ADAPTERS: Record<AgentId, AgentAdapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  freebuff: freebuffAdapter,
};

export function getAdapter(id: AgentId): AgentAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new Error(`Unknown agent id: ${id}`);
  }
  return adapter;
}

export function listAdapters(): AgentAdapter[] {
  return Object.values(ADAPTERS);
}

export { claudeCodeAdapter, codexAdapter, freebuffAdapter };
export { stripAnsi } from "./strip-ansi.js";
