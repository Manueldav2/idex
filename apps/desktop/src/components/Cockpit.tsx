import { useEffect } from "react";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import { useFeed } from "@/store/feed";
import { SessionTabs } from "./SessionTabs";
import { SessionView } from "./SessionView";
import { FeedPane } from "./FeedPane";
import { IdexLogo } from "./IdexLogo";
import { EditorMode } from "./editor/EditorMode";
import { PanelRightClose, PanelRightOpen, Settings as SettingsIcon } from "lucide-react";
import type { CockpitMode } from "@idex/types";
import { cn } from "@/lib/cn";

export function Cockpit() {
  const config = useSettings((s) => s.config);
  const patchConfig = useSettings((s) => s.patch);
  const sessions = useAgent((s) => s.sessions);
  const order = useAgent((s) => s.order);
  const activeId = useAgent((s) => s.activeId);
  const createSession = useAgent((s) => s.createSession);
  const closeSession = useAgent((s) => s.closeSession);
  const setActive = useAgent((s) => s.setActive);
  const feedState = useFeed((s) => s.state);
  const setFeedState = useFeed((s) => s.setState);

  const mode: CockpitMode = config.mode ?? "agent";
  const setMode = (next: CockpitMode) => {
    if (next === mode) return;
    void patchConfig({ mode: next });
  };

  // Spawn a first session on mount if none exists — only relevant for agent
  // mode, but we keep the session alive regardless so state persists when the
  // user toggles modes.
  useEffect(() => {
    if (order.length === 0) {
      void createSession({ agentId: config.selectedAgent });
    }
  }, [config.selectedAgent, createSession, order.length]);

  // Keyboard shortcuts. Session-nav shortcuts are agent-mode only; ⌘E toggles
  // modes globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setMode(mode === "agent" ? "editor" : "agent");
        return;
      }

      if (mode !== "agent") return;

      if (e.key === "t") {
        e.preventDefault();
        void createSession({ agentId: config.selectedAgent });
      } else if (e.key === "w") {
        e.preventDefault();
        if (activeId) void closeSession(activeId);
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const id = order[idx];
        if (id) {
          e.preventDefault();
          setActive(id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, config.selectedAgent, createSession, closeSession, mode, order, setActive]);

  const active = activeId ? sessions[activeId] : null;
  const lastError = active?.lastError ?? null;
  const globalError = useAgent((s) => s.globalError);
  const clearGlobalError = useAgent((s) => s.clearGlobalError);

  return (
    <div className="flex h-full w-full bg-ink-0">
      <main className="relative flex h-full flex-1 flex-col bg-ink-1 border-r border-line min-w-0">
        <header className="glass draggable flex items-center justify-between border-b border-line pl-24 pr-4 py-3 h-14 shrink-0">
          <div className="flex items-center gap-4 no-drag min-w-0">
            <IdexLogo />
            <div className="text-[12px] font-mono text-text-secondary flex items-center gap-2 min-w-0">
              <span className="text-text-primary font-medium truncate">
                {mode === "editor" ? "editor" : active?.session.label ?? "no session"}
              </span>
              <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-accent-soft text-accent shrink-0">
                v0.1
              </span>
            </div>
          </div>
          <div className="no-drag flex items-center gap-2">
            <ModeToggle mode={mode} onChange={setMode} />
            <div className="w-px h-4 bg-line mx-1" />
            <button
              onClick={() => setFeedState(feedState === "peek" ? "expanded" : "peek")}
              title={feedState === "peek" ? "Expand feed" : "Collapse feed"}
              className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              {feedState === "peek" ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            </button>
            <button
              onClick={() => void patchConfig({ privacyDisclosureAccepted: false })}
              title="Settings"
              className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              <SettingsIcon className="size-4" />
            </button>
          </div>
        </header>

        {mode === "agent" && <SessionTabs />}

        {mode === "agent" && (lastError || globalError) && (
          <div className="border-b border-error/25 bg-error/10 px-6 py-3 text-[12px] text-error flex items-start justify-between gap-4">
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold">Couldn't start your agent.</span>{" "}
              <span className="opacity-80">{lastError ?? globalError}</span>
              <div className="mt-1.5 text-[11px] font-mono text-text-secondary">
                install:{" "}
                <code className="bg-ink-0 px-1.5 py-0.5 rounded border border-line">
                  npm i -g @anthropic-ai/claude-code
                </code>
              </div>
            </div>
            <button
              onClick={() => {
                clearGlobalError();
                void createSession({ agentId: config.selectedAgent });
              }}
              className="press-feedback text-[11px] font-mono text-error hover:brightness-125 underline-offset-2 hover:underline shrink-0"
            >
              retry
            </button>
          </div>
        )}

        <div className="relative flex-1 min-h-0">
          {/*
            Keep SessionView mounted in both modes so terminal scrollback and
            PTY-backed xterm instances persist when toggling into the editor
            and back. We hide (not unmount) the agent surface in editor mode.
          */}
          <div
            style={{ display: mode === "agent" ? "block" : "none" }}
            className="absolute inset-0"
          >
            {order.length === 0 ? (
              <EmptyState onNew={() => void createSession({ agentId: config.selectedAgent })} />
            ) : (
              order.map((id) => {
                const sd = sessions[id];
                if (!sd) return null;
                return <SessionView key={id} data={sd} active={id === activeId} />;
              })
            )}
          </div>
          {mode === "editor" && (
            <div className="absolute inset-0">
              <EditorMode />
            </div>
          )}
        </div>

        <footer className="border-t border-line bg-ink-1 px-6 py-2 flex items-center justify-between text-[10px] font-mono text-text-secondary shrink-0">
          <div className="flex items-center gap-3">
            {mode === "agent" ? (
              <>
                <span className="opacity-70">
                  <kbd className="px-1 py-0.5 rounded border border-line">⌘T</kbd> new
                </span>
                <span className="opacity-70">
                  <kbd className="px-1 py-0.5 rounded border border-line">⌘W</kbd> close
                </span>
                <span className="opacity-70">
                  <kbd className="px-1 py-0.5 rounded border border-line">⌘1-9</kbd> switch
                </span>
                <span className="opacity-50 ml-2">·</span>
                <span>{order.length} session{order.length === 1 ? "" : "s"}</span>
              </>
            ) : (
              <>
                <span className="opacity-70">
                  <kbd className="px-1 py-0.5 rounded border border-line">⌘S</kbd> save
                </span>
                <span className="opacity-70">
                  <kbd className="px-1 py-0.5 rounded border border-line">⌘E</kbd> agent
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void patchConfig({ feedEnabled: !config.feedEnabled })}
              className="press-feedback opacity-70 hover:opacity-100 hover:text-accent"
            >
              feed {config.feedEnabled ? "on" : "off"}
            </button>
          </div>
        </footer>
      </main>

      <FeedPane />
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: CockpitMode; onChange: (m: CockpitMode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Cockpit mode"
      className="inline-flex items-center rounded-md border border-line bg-ink-2/60 p-0.5"
    >
      {(["agent", "editor"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={cn(
              "press-feedback text-[11px] font-mono px-2 py-1 rounded transition-colors",
              active
                ? "bg-ink-0 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
            title={m === "agent" ? "Agent mode (⌘E)" : "Editor mode (⌘E)"}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <button
        onClick={onNew}
        className="press-feedback text-text-secondary hover:text-text-primary text-sm font-mono"
      >
        click <span className="text-accent">+ new</span> or press{" "}
        <kbd className="px-1.5 py-0.5 rounded border border-line">⌘T</kbd> to start a session
      </button>
    </div>
  );
}
