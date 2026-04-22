import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type {
  AgentId,
  ExternalAgentLaunchOptions,
  ExternalAgentLaunchResult,
} from "@idex/types";

const execAsync = promisify(exec);

/**
 * Build the shell command we want Terminal.app to run. Each agent has
 * its own CLI; for unknown ids we fall back to a plain shell so the
 * window still opens at the workspace and the user can type the
 * command themselves.
 *
 * We `exec` (not just call) the binary so when the user later types
 * `exit` the shell — and the Terminal window — closes immediately
 * instead of dropping back to a fresh zsh prompt.
 */
function commandFor(agentId: AgentId): string {
  switch (agentId) {
    case "claude-code":
      return "exec claude";
    case "codex":
      return "exec codex";
    case "freebuff":
      return "exec freebuff";
    case "shell":
    default:
      return "exec $SHELL -l";
  }
}

/**
 * AppleScript escaper. Terminal.app's `do script` consumes a quoted
 * string literal; the only chars we need to neutralise are " and \.
 */
function escapeForApplescript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Launch the chosen agent inside a fresh Terminal.app window in the
 * user's chosen workspace. Returns the AppleScript-reported window
 * id so the renderer can bring the window forward later.
 *
 * We add the same PATH-augmenting logic the in-process agent host
 * had — Launch Services-style spawns inherit a stripped PATH that
 * usually doesn't include nvm / homebrew bins, so `claude` would
 * frequently 404 in a freshly opened Terminal too.
 */
export async function launchExternalAgent(
  opts: ExternalAgentLaunchOptions,
): Promise<ExternalAgentLaunchResult> {
  const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : os.homedir();
  const command = commandFor(opts.agentId);

  const extraPaths = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${os.homedir()}/.volta/bin`,
    `${os.homedir()}/.bun/bin`,
    `${os.homedir()}/.pnpm/bin`,
  ];
  // Best-effort: pick the latest nvm node if installed.
  try {
    const fs = await import("node:fs");
    const nvm = `${os.homedir()}/.nvm/versions/node`;
    if (fs.existsSync(nvm)) {
      for (const v of fs.readdirSync(nvm)) extraPaths.push(`${nvm}/${v}/bin`);
    }
  } catch { /* ignore */ }

  const exportPath = `export PATH="${extraPaths.join(":")}:$PATH"`;
  const cdLine = `cd "${escapeForApplescript(cwd)}"`;
  const initialPrompt = opts.initialPrompt?.trim();
  const promptLine = initialPrompt
    ? ` && printf %s ${shellQuote(initialPrompt)}`
    : "";

  // Combine into one shell line so Terminal runs them in sequence
  // without intermediate empty prompts.
  const fullCmd = `${exportPath} && ${cdLine} && ${command}${promptLine}`;

  const script = `tell application "Terminal"
  activate
  set newTab to do script "${escapeForApplescript(fullCmd)}"
  set windowId to id of (window 1 whose tabs contains newTab)
  return windowId
end tell`;

  try {
    const { stdout } = await execAsync(`osascript -e '${escapeForOsascriptArg(script)}'`);
    const windowId = Number(stdout.trim());
    const label = friendlyLabel(opts.agentId, cwd);
    return {
      ok: true,
      windowId: Number.isFinite(windowId) ? windowId : undefined,
      label,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Shell-quote a string for safe inclusion in a bash command run inside
 * AppleScript. Single-quotes everything and escapes embedded single
 * quotes by closing-and-reopening — the standard trick.
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * `osascript -e '<arg>'` is wrapped in shell single quotes already, so
 * single quotes inside the AppleScript itself need to be escaped via the
 * close-then-reopen trick. Newlines pass through fine.
 */
function escapeForOsascriptArg(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

function friendlyLabel(agentId: AgentId, cwd: string): string {
  const shortCwd = cwd.replace(os.homedir(), "~").split("/").filter(Boolean).slice(-2).join("/") || "~";
  const display = {
    "claude-code": "Claude Code",
    codex: "Codex",
    freebuff: "Freebuff",
    shell: "Shell",
  }[agentId] ?? agentId;
  return `${display} · ${shortCwd}`;
}

/**
 * Bring the given Terminal.app window to the front by id. Used when the
 * user clicks a session card in IDEX and wants to switch back to where
 * the agent is actually running.
 */
export async function focusExternalWindow(windowId: number): Promise<boolean> {
  if (!Number.isFinite(windowId)) return false;
  const script = `tell application "Terminal"
  activate
  set index of window id ${windowId} to 1
end tell`;
  try {
    await execAsync(`osascript -e '${escapeForOsascriptArg(script)}'`);
    return true;
  } catch {
    return false;
  }
}
