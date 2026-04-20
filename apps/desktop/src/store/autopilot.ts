import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { useAgent } from "./agent";
import { useFeed } from "./feed";
import { renderKickoffPrompt } from "@/components/autopilot/AutopilotKickoffPrompt";

export type AutopilotStatus = "idle" | "running" | "paused" | "done" | "error";

interface AutopilotStore {
  /** The user-entered goal driving the current run, or null when idle. */
  goal: string | null;
  /** The Claude Code session id executing the autopilot task. */
  sessionId: string | null;
  /** Lifecycle status — distinct from the session's own AgentState because
   *  autopilot layers its own semantics (paused, done, error) on top. */
  status: AutopilotStatus;
  /** Epoch ms when start() was called — used by the UI for an elapsed timer. */
  startedAt: number | null;
  /** Last error surfaced from start() or a session-level failure. */
  error: string | null;

  /** Kick off a new autopilot run: spawn a session, send the kickoff prompt,
   *  expand the feed. Safe to call only when idle. */
  start: (goal: string) => Promise<void>;
  /** Append a user-supplied context blob mid-flight. Sends `\n<USER INJECT>: …` */
  inject: (text: string) => Promise<void>;
  /** Kill the backing session and return the store to idle. */
  cancel: () => Promise<void>;
  /** Hard reset without touching any session (use after cancel resolves). */
  reset: () => void;
}

export const useAutopilot = create<AutopilotStore>((set, get) => ({
  goal: null,
  sessionId: null,
  status: "idle",
  startedAt: null,
  error: null,

  async start(goal) {
    const trimmed = goal.trim();
    if (!trimmed) return;
    if (get().status !== "idle") return;

    set({ status: "running", error: null, goal: trimmed, startedAt: Date.now() });

    const agent = useAgent.getState();
    const result = await agent.createSession({ agentId: "claude-code" });
    if (!result.ok || !result.id) {
      set({
        status: "error",
        error: result.error ?? "Could not spawn autopilot session.",
        goal: trimmed,
        startedAt: null,
        sessionId: null,
      });
      return;
    }

    const sessionId = result.id;
    const prompt = renderKickoffPrompt(trimmed);

    // Ensure the feed is in its dominant expanded state and re-curated around
    // the goal so the user has something relevant to read immediately.
    useFeed.getState().setState("expanded");
    // Record the goal as a user_input event so the curator picks it up on the
    // very first refresh — otherwise the feed starts with whatever starter
    // cards were already loaded.
    agent.pushUserEvent(sessionId, trimmed);
    useFeed.getState().refresh(sessionId);

    await ipc().agent.input({ sessionId, text: `${prompt}\r` });

    set({ sessionId });
  },

  async inject(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { sessionId, status } = get();
    if (!sessionId || status !== "running") return;

    // Make the inject visibly distinct in the transcript so the agent can
    // spot it between its own turns.
    const framed = `\n<USER INJECT>: ${trimmed}\n`;
    useAgent.getState().pushUserEvent(sessionId, `<inject> ${trimmed}`);
    await ipc().agent.input({ sessionId, text: framed });
    useFeed.getState().refresh(sessionId);
  },

  async cancel() {
    const { sessionId } = get();
    if (sessionId) {
      await useAgent.getState().closeSession(sessionId);
    }
    set({
      goal: null,
      sessionId: null,
      status: "idle",
      startedAt: null,
      error: null,
    });
  },

  reset() {
    set({
      goal: null,
      sessionId: null,
      status: "idle",
      startedAt: null,
      error: null,
    });
  },
}));
