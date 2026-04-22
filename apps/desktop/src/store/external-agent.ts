import { create } from "zustand";
import type { AgentId } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useSettings } from "./settings";
import { useFeed } from "./feed";

/**
 * Tracks the agents IDEX has launched into Terminal.app windows. We
 * never own the PTY in this mode — Apple's Terminal does — so a
 * "session" here is just a visible card in the cockpit: a label, an
 * agent type, the cwd it opened in, and the macOS window id we use to
 * bring it forward when the user clicks the card.
 */
export interface ExternalSession {
  id: string;
  agentId: AgentId;
  cwd: string;
  label: string;
  /** macOS Terminal.app window id, used to bring it forward. */
  windowId?: number;
  createdAt: number;
}

interface ExternalAgentStore {
  sessions: ExternalSession[];
  /** A free-form note the user gives the curator about what they're
   *  doing. Drives feed query relevance since we can't see Terminal
   *  prompts directly. */
  context: string;

  launch: (opts: { agentId?: AgentId; cwd?: string; initialPrompt?: string }) =>
    Promise<{ ok: boolean; error?: string; session?: ExternalSession }>;
  remove: (id: string) => void;
  setContext: (text: string) => void;
}

export const useExternalAgent = create<ExternalAgentStore>((set, get) => ({
  sessions: [],
  context: "",

  async launch(opts) {
    const cfg = useSettings.getState().config;
    const agentId: AgentId = opts.agentId ?? cfg.selectedAgent ?? "claude-code";
    const cwd = opts.cwd ?? cfg.workspacePath ?? "";
    const r = await ipc().agent.launchExternal({
      agentId,
      cwd,
      initialPrompt: opts.initialPrompt,
    });
    if (!r.ok) return { ok: false, error: r.error };
    const session: ExternalSession = {
      id: crypto.randomUUID(),
      agentId,
      cwd,
      label: r.label ?? "Agent",
      windowId: r.windowId,
      createdAt: Date.now(),
    };
    set((s) => ({ sessions: [...s.sessions, session] }));
    // The launch IS the moment the user wants to read the feed — they
    // just kicked off an agent and are about to wait. Open the feed.
    useFeed.getState().setState("expanded");
    if (opts.initialPrompt && opts.initialPrompt.trim().length > 0) {
      useFeed.getState().refresh();
    }
    return { ok: true, session };
  },

  remove(id) {
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
  },

  setContext(text) {
    set({ context: text });
  },
}));
