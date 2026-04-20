import { useEffect } from "react";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import { useFeed } from "@/store/feed";
import { SessionTabs } from "./SessionTabs";
import { SessionView } from "./SessionView";
import { FeedPane } from "./FeedPane";
import { IdexLogo } from "./IdexLogo";
import { PanelRightClose, PanelRightOpen, Settings as SettingsIcon } from "lucide-react";

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

  // Spawn a first session on mount if none exists
  useEffect(() => {
    if (order.length === 0) {
      void createSession({ agentId: config.selectedAgent });
    }
  }, [config.selectedAgent, createSession, order.length]);

  // Keyboard shortcuts for session nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
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
  }, [activeId, config.selectedAgent, createSession, closeSession, order, setActive]);

  const active = activeId ? sessions[activeId] : null;
  const lastError = active?.lastError ?? null;

  return (
    <div className="flex h-full w-full bg-ink-0">
      <main className="relative flex h-full flex-1 flex-col bg-ink-1 border-r border-line min-w-0">
        <header className="glass draggable flex items-center justify-between border-b border-line pl-24 pr-4 py-3 h-14 shrink-0">
          <div className="flex items-center gap-4 no-drag min-w-0">
            <IdexLogo />
            <div className="text-[12px] font-mono text-text-secondary flex items-center gap-2 min-w-0">
              <span className="text-text-primary font-medium truncate">
                {active?.session.label ?? "no session"}
              </span>
              <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-accent-soft text-accent shrink-0">
                v0.1
              </span>
            </div>
          </div>
          <div className="no-drag flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-secondary hidden sm:inline">
              <kbd className="px-1 py-0.5 rounded border border-line mr-0.5">⌘T</kbd>new
              <kbd className="px-1 py-0.5 rounded border border-line mx-1">⌘W</kbd>close
              <kbd className="px-1 py-0.5 rounded border border-line">⌘1-9</kbd>switch
            </span>
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

        <SessionTabs />

        {lastError && (
          <div className="border-b border-error/20 bg-error/10 px-6 py-3 text-[12px] text-error">
            {lastError}
          </div>
        )}

        <div className="relative flex-1 min-h-0">
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

        <footer className="border-t border-line bg-ink-1 px-6 py-2.5 flex items-center justify-between text-[11px] font-mono text-text-secondary shrink-0">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">⌃C</kbd> interrupt
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">⌃D</kbd> exit
            </span>
            <span>{order.length} session{order.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>feed {config.feedEnabled ? "on" : "off"}</span>
            <button
              onClick={() => void patchConfig({ feedEnabled: !config.feedEnabled })}
              className="press-feedback text-accent hover:brightness-125 underline-offset-2 hover:underline"
            >
              toggle
            </button>
          </div>
        </footer>
      </main>

      <FeedPane />
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
