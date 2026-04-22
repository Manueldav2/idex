import type { AgentAdapter } from "@idex/types";
import { stripAnsi } from "./strip-ansi.js";

/**
 * Shell adapter — a raw login shell running in the user's PTY. This is
 * NOT an AI agent. It's the integrated terminal you'd get in Cursor or
 * VSCode: same binary as your real shell, same dotfiles, same PATH. We
 * reuse the agent-host infrastructure so we get session tabs, kill,
 * resize, and output streaming for free — but the prompt-boundary
 * detection is intentionally a no-op since shells emit their own PS1
 * indicator and we don't want to second-guess it.
 */

const SHELL_FALLBACK = "/bin/zsh";

export const shellAdapter: AgentAdapter = {
  id: "shell",
  displayName: "Shell",

  detect({ rawChunk }) {
    // Shells don't have the "agent done" semantic that drives the feed,
    // so we never emit boundaries. The feed remains whatever state the
    // user left it in while using the terminal.
    return {
      userPromptBoundary: false,
      agentDoneBoundary: false,
      cleanText: stripAnsi(rawChunk),
    };
  },

  /**
   * Run the user's actual login shell. We prefer $SHELL so the terminal
   * honors zsh/bash/fish/nushell preferences, but fall back to zsh (the
   * default on macOS 10.15+). `-l` makes it a login shell so ~/.zprofile
   * and friends run — which is what the user expects when they open a
   * terminal inside an IDE.
   *
   * The adapter is shared between main and renderer; the renderer never
   * has process.env, so we look it up via globalThis and fall back
   * cleanly. getCommand() is in practice only called from main (where
   * process.env is fine), but this keeps the types honest in either
   * environment.
   */
  getCommand() {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env;
    const shellPath = env?.["SHELL"] || SHELL_FALLBACK;
    return { cmd: shellPath, args: ["-l"] };
  },
};
