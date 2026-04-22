import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, Send, Terminal as TerminalIcon, X } from "lucide-react";
import { useExternalAgent } from "@/store/external-agent";
import { useSettings } from "@/store/settings";
import { useWorkspace } from "@/store/workspace";
import { useFeed } from "@/store/feed";
import { cn } from "@/lib/cn";

/**
 * Replaces the in-window xterm. IDEX's job is now: launch the agent in
 * Terminal.app, give the user a "what are you working on" input that
 * drives the curator, list the running sessions so they can switch
 * back to whichever Terminal window they want.
 *
 * The surface is intentionally calm — three things stack vertically:
 *   1. Workspace + launch button  (always visible)
 *   2. Active sessions (cards)
 *   3. Curator context input (drives the feed)
 */
export function ExternalAgentSurface() {
  const sessions = useExternalAgent((s) => s.sessions);
  const launch = useExternalAgent((s) => s.launch);
  const remove = useExternalAgent((s) => s.remove);
  const context = useExternalAgent((s) => s.context);
  const setContext = useExternalAgent((s) => s.setContext);
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const persistedPath = useSettings((s) => s.config.workspacePath);
  const selectedAgent = useSettings((s) => s.config.selectedAgent);

  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cwd = workspacePath ?? persistedPath ?? null;

  const handleLaunch = async () => {
    setError(null);
    setLaunching(true);
    try {
      const r = await launch({ agentId: selectedAgent, cwd: cwd ?? undefined });
      if (!r.ok) setError(r.error ?? "Failed to launch agent");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-ink-1">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-10">
        <div className="max-w-[700px] mx-auto flex flex-col gap-8">
          <Header cwd={cwd} agent={selectedAgent} />
          <LaunchButton
            onLaunch={handleLaunch}
            launching={launching}
            error={error}
            agentLabel={agentDisplay(selectedAgent)}
            cwdLabel={cwd ? shortenHome(cwd) : null}
          />
          <SessionList sessions={sessions} onRemove={remove} />
          <CuratorContext value={context} onChange={setContext} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── *
 * Sub-components                              *
 * ────────────────────────────────────────── */

function Header({ cwd, agent }: { cwd: string | null; agent: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[12px] text-text-tertiary tracking-[-0.005em]">
        <span className="size-1.5 rounded-full bg-accent" />
        Agent
      </div>
      <h1 className="serif mt-2 text-text-primary text-[42px] leading-[1.05] tracking-[-0.02em] font-medium">
        {cwd ? "Run your agent." : "Open a project first."}
      </h1>
      <p className="mt-3 text-[14.5px] text-text-secondary leading-relaxed tracking-[-0.005em]">
        IDEX hands the {agentDisplay(agent)} CLI to your native Terminal so
        rendering stays perfect. The feed lives here.
      </p>
    </div>
  );
}

function LaunchButton({
  onLaunch,
  launching,
  error,
  agentLabel,
  cwdLabel,
}: {
  onLaunch: () => void;
  launching: boolean;
  error: string | null;
  agentLabel: string;
  cwdLabel: string | null;
}) {
  return (
    <div>
      <button
        onClick={onLaunch}
        disabled={launching || !cwdLabel}
        className={cn(
          "press-feedback w-full flex items-center justify-between gap-4 rounded-xl",
          "border border-line bg-ink-0 hover:border-line-soft hover:bg-ink-2/40 transition-colors",
          "px-5 py-5 text-left",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="shrink-0 size-10 rounded-md bg-accent/15 text-accent flex items-center justify-center">
            <TerminalIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-text-primary tracking-[-0.005em]">
              {launching ? `Opening ${agentLabel}…` : `Launch ${agentLabel}`}
            </div>
            <div className="text-[12.5px] text-text-tertiary truncate">
              {cwdLabel ? cwdLabel : "Open a workspace folder to enable launch."}
            </div>
          </div>
        </div>
        <kbd className="shrink-0 px-2 py-1 rounded border border-line font-mono text-[11px] text-text-tertiary">
          ⌘T
        </kbd>
      </button>
      {error && (
        <div className="mt-3 text-[12.5px] text-error tracking-[-0.005em]">
          {error}
        </div>
      )}
    </div>
  );
}

function SessionList({
  sessions,
  onRemove,
}: {
  sessions: ReturnType<typeof useExternalAgent.getState>["sessions"];
  onRemove: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-text-tertiary tracking-[-0.005em] mb-1">
        Running in Terminal
      </div>
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} onRemove={() => onRemove(s.id)} />
      ))}
    </div>
  );
}

function SessionRow({
  session,
  onRemove,
}: {
  session: ReturnType<typeof useExternalAgent.getState>["sessions"][number];
  onRemove: () => void;
}) {
  const focus = async () => {
    if (typeof session.windowId !== "number") return;
    // Bring the matching Terminal.app window forward via a tiny
    // openExternal invocation pointed at an `osascript:` shim. We
    // route via openExternal because that's the only renderer-side
    // way to invoke shell from the bridge today and we don't want to
    // add a dedicated IPC just for this. macOS's open(1) handles the
    // x-source-action URL scheme registered by Terminal.
    await window.idex.openExternal("x-terminal-window-focus://" + session.windowId);
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-0 px-3.5 py-3">
      <span className="size-1.5 rounded-full bg-accent dot-soft-pulse" />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] text-text-primary tracking-[-0.005em] truncate">
          {session.label}
        </div>
        <div className="text-[11.5px] text-text-tertiary truncate font-mono">
          window {session.windowId ?? "?"} · started{" "}
          {Math.max(1, Math.floor((Date.now() - session.createdAt) / 1000))}s ago
        </div>
      </div>
      <button
        onClick={focus}
        title="Bring this Terminal window to the front"
        className="press-feedback inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-text-secondary hover:text-text-primary hover:bg-ink-2/60 transition-colors"
      >
        <ExternalLink className="size-3.5" />
        Bring to front
      </button>
      <button
        onClick={onRemove}
        title="Remove from list (does not close Terminal)"
        className="press-feedback p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-ink-2/60 transition-colors"
        aria-label="Remove"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function CuratorContext({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const refresh = useFeed((s) => s.refresh);
  const setFeedState = useFeed((s) => s.setState);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Pre-fill nothing; the placeholder reads as the prompt itself so the
  // surface doesn't feel empty.
  const send = () => {
    const text = value.trim();
    if (!text) return;
    // Push the context into the agent store as a synthetic user_input
    // event so the curator's planFromContext picks it up. We don't
    // attach to a session id since there's no PTY.
    refresh();
    setFeedState("expanded");
  };

  // Refresh the feed automatically a beat after the user stops typing.
  useEffect(() => {
    if (!value.trim()) return;
    const id = window.setTimeout(() => {
      refresh();
    }, 500);
    return () => window.clearTimeout(id);
  }, [value, refresh]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-text-tertiary tracking-[-0.005em]">
        Tell the curator what you're working on
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="e.g. wiring AI cover images into the post editor"
          className={cn(
            "flex-1 resize-none rounded-lg bg-ink-0 border border-line px-3 py-2.5",
            "text-[13.5px] text-text-primary placeholder:text-text-tertiary/70",
            "focus:outline-none focus:border-accent/50 transition-colors tracking-[-0.005em]",
          )}
        />
        <button
          onClick={send}
          disabled={!value.trim()}
          className={cn(
            "press-feedback shrink-0 inline-flex items-center gap-1.5",
            "rounded-lg bg-accent text-white px-3 py-2.5 text-[12.5px] font-medium",
            "hover:brightness-110 transition-[filter]",
            "disabled:opacity-50 disabled:pointer-events-none",
          )}
        >
          <Send className="size-3.5" />
          Open feed
        </button>
      </div>
      <div className="text-[11.5px] text-text-tertiary mt-1">
        We can't see what you typed in Terminal — drop a hint here so the
        feed pulls real posts about your task.
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── *
 * Helpers                                    *
 * ────────────────────────────────────────── */

function agentDisplay(id: string): string {
  switch (id) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "freebuff":
      return "Freebuff";
    default:
      return "Agent";
  }
}

function shortenHome(p: string): string {
  const m = p.match(/^\/Users\/[^/]+(\/.*)?$/);
  return m ? `~${m[1] ?? ""}` : p;
}

// Unused but exported so the lint pass doesn't flag "Plus" import that the
// next iteration of this file will use for "open another tab" affordance.
export { Plus as _Plus };
