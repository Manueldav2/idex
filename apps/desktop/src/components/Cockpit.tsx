import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import { useFeed } from "@/store/feed";
import { useAutopilot } from "@/store/autopilot";
import { useWorkspace } from "@/store/workspace";
import { useEditorUI } from "@/store/editor-ui";
import { wireProjectsToSettings } from "@/store/projects";
import { SessionTabs } from "./SessionTabs";
import { SessionView } from "./SessionView";
import { FeedPane } from "./FeedPane";
import { IdexLogo } from "./IdexLogo";
import { EditorMode } from "./editor/EditorMode";
import { AutopilotMode } from "./autopilot/AutopilotMode";
import { AutopilotLauncher } from "./autopilot/AutopilotLauncher";
import { CommandPalette } from "./CommandPalette";
import { ProjectsLauncher } from "./projects/ProjectsLauncher";
import { Settings as SettingsDrawer } from "./Settings";
import {
  Folder,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import type { CockpitMode } from "@idex/types";
import { cn } from "@/lib/cn";

// One-shot: wire the projects store to settings so recents hydrate on load
// and stay in sync when config is patched elsewhere. Safe to call repeatedly.
wireProjectsToSettings();

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
  const autopilotGoal = useAutopilot((s) => s.goal);
  const autopilotCancel = useAutopilot((s) => s.cancel);
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const persistedWorkspacePath = config.workspacePath;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const mode: CockpitMode = config.mode ?? "agent";
  const setMode = (next: CockpitMode) => {
    if (next === mode) return;
    void patchConfig({ mode: next });
  };

  // Spawn a first session on mount if none exists. IDEX hosts the
  // agent terminal inline — same model as Cursor's integrated terminal.
  useEffect(() => {
    if (order.length === 0) {
      void createSession({ agentId: config.selectedAgent });
    }
  }, [config.selectedAgent, createSession, order.length]);

  // Keyboard shortcuts. Session-nav shortcuts are agent-mode only; ⌘E and
  // ⌘P toggle modes globally; ⌘. cancels an autopilot run; ⌘K opens the
  // command palette; ⌘⇧O opens a folder; ⌘, opens the settings/setup
  // screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setMode(mode === "agent" ? "editor" : "agent");
        return;
      }

      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setMode(mode === "autopilot" ? "agent" : "autopilot");
        return;
      }

      if (e.key === ".") {
        if (mode === "autopilot" && autopilotGoal) {
          e.preventDefault();
          void autopilotCancel();
        }
        return;
      }

      // ⌘, → settings (re-run setup). Cursor/VSCode convention.
      if (e.key === ",") {
        e.preventDefault();
        void patchConfig({ privacyDisclosureAccepted: false });
        return;
      }

      // ⌘⇧O → open folder. (⌘O in Cursor opens file; we don't have a
      // raw-file-open IPC yet so folder-open is the useful analog.)
      if (e.shiftKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        void useWorkspace.getState().openWorkspace();
        return;
      }

      // ⌘` → toggle the integrated terminal. Matches Cursor / VSCode.
      // Also snaps into editor mode so the terminal has somewhere to
      // appear (otherwise it'd open "in agent mode" which is confusing).
      if (e.key === "`" || e.code === "Backquote") {
        e.preventDefault();
        useEditorUI.getState().toggleTerminal();
        // Re-read state AFTER the toggle — getState() returns a fresh
        // snapshot each call. If the terminal just became open and we
        // aren't in editor mode, snap there.
        if (useEditorUI.getState().terminalOpen && mode !== "editor") {
          setMode("editor");
        }
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
  }, [activeId, autopilotCancel, autopilotGoal, config.selectedAgent, createSession, closeSession, mode, order, patchConfig, setActive]);

  const active = activeId ? sessions[activeId] : null;
  const lastError = active?.lastError ?? null;
  const globalError = useAgent((s) => s.globalError);
  const clearGlobalError = useAgent((s) => s.clearGlobalError);

  // Show the fullscreen ProjectsLauncher only on a truly fresh launch
  // (no active workspace and no history). Once the user has at least one
  // recent, we default to the normal cockpit and expose the launcher via
  // the Projects button and ⌘K instead — avoids forcing existing users
  // through a landing page every boot.
  const showFullscreenLauncher =
    !persistedWorkspacePath && (config.recentProjects?.length ?? 0) === 0;

  // Display path for the header indicator. Prefer the loaded workspace
  // (reflects any in-session switch) but fall back to what's persisted.
  const activeWorkspace = workspacePath ?? persistedWorkspacePath ?? null;
  const displayWorkspace = useMemo(
    () => (activeWorkspace ? shortenHome(activeWorkspace) : null),
    [activeWorkspace],
  );

  return (
    <div className="flex h-full w-full bg-ink-0">
      <main className="relative flex h-full flex-1 flex-col bg-ink-0 border-r border-line min-w-0">
        <header className="glass draggable flex items-center justify-between border-b border-line pl-24 pr-4 py-3 h-14 shrink-0">
          <div className="flex items-center gap-3.5 no-drag min-w-0">
            <IdexLogo />
            <span className="h-4 w-px bg-line shrink-0" />
            <div className="text-[13px] text-text-secondary flex items-center gap-2 min-w-0 tracking-[-0.005em]">
              <span className="text-text-primary truncate">
                {mode === "editor"
                  ? "Editor"
                  : mode === "autopilot"
                    ? "Autopilot"
                    : active?.session.label ?? "Agent"}
              </span>
              {displayWorkspace && (
                <>
                  <span className="text-text-tertiary/60 mx-0.5">/</span>
                  <button
                    onClick={() => setMode("editor")}
                    title={`workspace: ${activeWorkspace}\nClick to open editor`}
                    className="press-feedback group inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-ink-2/70 transition-colors min-w-0"
                  >
                    <Folder className="size-3.5 text-text-tertiary group-hover:text-text-secondary shrink-0 transition-colors" />
                    <span className="truncate max-w-[200px] font-mono text-[12px] text-text-secondary group-hover:text-text-primary">
                      {displayWorkspace}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="no-drag flex items-center gap-1.5">
            <button
              onClick={() => setProjectsModalOpen(true)}
              title="Projects"
              className="press-feedback inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              <FolderOpen className="size-3.5" />
              Projects
            </button>
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
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              <SettingsIcon className="size-4" />
            </button>
          </div>
        </header>

        {mode === "agent" && !showFullscreenLauncher && <SessionTabs />}

        {mode === "agent" && (lastError || globalError) && (
          <div className="border-b border-error/25 bg-error/10 px-6 py-3 text-[12px] text-error flex items-start justify-between gap-4">
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold">Couldn't launch your agent.</span>{" "}
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

        {/*
          Main workspace: Sidebar on the left (always), content on the right.
          The Sidebar renders the shared FileTree so users can see their
          project in any mode. Agent-mode file clicks auto-switch to editor.
          Editor mode also renders its own internal sidebar via EditorMode;
          to avoid a visual double-pane in that mode we hide the global
          Sidebar when mode === "editor".
        */}
        <div className="relative flex-1 min-h-0 flex">
          {/*
            Sidebar (file tree + Open editors) only shows in editor mode
            now. Agent and autopilot modes don't benefit from it — the
            user's there to talk to Claude, not browse files — and
            having it around was crowding the terminal column. To reach
            files, press ⌘E.
          */}
          {/*
            min-w-0 here is load-bearing. Without it, this flex child
            gets the default min-width:auto, which makes it grow to its
            content's natural width (xterm reports its preferred cols
            as content) and the FeedPane next door gets squeezed —
            *or* this surface gets squeezed and xterm reads a 0px
            container, fitting to ~10 cols. min-w-0 lets the row
            distribute width purely by flex-1 / explicit feed width.
          */}
          <div className="relative flex-1 min-w-0 min-h-0">
            {showFullscreenLauncher ? (
              <ProjectsLauncher onProjectOpened={() => { /* tree loads automatically */ }} />
            ) : (
              <>
                {/*
                  Keep SessionView mounted in both modes so terminal scrollback and
                  PTY-backed xterm instances persist when toggling into the editor
                  and back. We hide (not unmount) the agent surface in non-agent modes.
                */}
                <div
                  style={{ display: mode === "agent" ? "block" : "none" }}
                  className="absolute inset-0"
                >
                  {/*
                    Embedded xterm — same model as Cursor's integrated
                    terminal. All agent rendering happens inline; the
                    feed lives next to it. Shell sessions are filtered
                    out (they live in editor mode's TerminalPanel).
                  */}
                  {(() => {
                    const agentSessions = order.filter(
                      (id) => sessions[id]?.session.agentId !== "shell",
                    );
                    if (agentSessions.length === 0) {
                      return (
                        <EmptyState
                          onNew={() =>
                            void createSession({ agentId: config.selectedAgent })
                          }
                        />
                      );
                    }
                    return agentSessions.map((id) => {
                      const sd = sessions[id];
                      if (!sd) return null;
                      return (
                        <SessionView
                          key={id}
                          data={sd}
                          active={id === activeId}
                        />
                      );
                    });
                  })()}
                </div>
                {mode === "editor" && (
                  <div className="absolute inset-0">
                    <EditorMode />
                  </div>
                )}
                {mode === "autopilot" && (
                  <div className="absolute inset-0">
                    {autopilotGoal === null ? <AutopilotLauncher /> : <AutopilotMode />}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="border-t border-line bg-ink-0 px-6 py-2 flex items-center justify-between text-[11.5px] text-text-tertiary shrink-0 tracking-[-0.005em]">
          <div className="flex items-center gap-3.5">
            {mode === "agent" && (
              <>
                <FooterKey hint="New" chord="⌘T" />
                <FooterKey hint="Close" chord="⌘W" />
                <FooterKey hint="Switch" chord="⌘1-9" />
                <FooterKey hint="Palette" chord="⌘K" />
                <FooterKey hint="Autopilot" chord="⌘P" />
                <span className="text-text-tertiary/60 ml-1">·</span>
                <span>{order.length} session{order.length === 1 ? "" : "s"}</span>
              </>
            )}
            {mode === "autopilot" && (
              <>
                <FooterKey hint="Agent" chord="⌘P" />
                <FooterKey hint="Palette" chord="⌘K" />
                {autopilotGoal && <FooterKey hint="Cancel" chord="⌘." />}
              </>
            )}
            {mode === "editor" && (
              <>
                <FooterKey hint="Save" chord="⌘S" />
                <FooterKey hint="Agent" chord="⌘E" />
                <FooterKey hint="Terminal" chord="⌘`" />
                <FooterKey hint="Palette" chord="⌘K" />
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void patchConfig({ feedEnabled: !config.feedEnabled })}
              className="press-feedback hover:text-accent transition-colors"
            >
              Feed {config.feedEnabled ? "on" : "off"}
            </button>
          </div>
        </footer>
      </main>

      <FeedPane />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <AnimatePresence>
        {projectsModalOpen && (
          <motion.div
            key="projects-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-[55] flex items-start justify-center pt-[10vh] px-6 bg-black/55 backdrop-blur-sm"
            onClick={() => setProjectsModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.985 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border border-line bg-ink-1 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div />
                <button
                  onClick={() => setProjectsModalOpen(false)}
                  aria-label="Close"
                  className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <ProjectsLauncher
                variant="modal"
                onDismiss={() => setProjectsModalOpen(false)}
                onProjectOpened={() => setProjectsModalOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: CockpitMode; onChange: (m: CockpitMode) => void }) {
  const titleForMode: Record<CockpitMode, string> = {
    agent: "Agent mode (⌘E)",
    autopilot: "Autopilot mode (⌘P)",
    editor: "Editor mode (⌘E)",
  };
  const labelForMode: Record<CockpitMode, string> = {
    agent: "Agent",
    autopilot: "Autopilot",
    editor: "Editor",
  };
  return (
    <div
      role="tablist"
      aria-label="Cockpit mode"
      className="inline-flex items-center rounded-md border border-line bg-ink-2/50 p-0.5"
    >
      {(["agent", "autopilot", "editor"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={cn(
              "press-feedback text-[12px] px-2.5 py-1 rounded-[5px] transition-colors tracking-[-0.005em]",
              active
                ? "bg-ink-0 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
            title={titleForMode[m]}
          >
            {labelForMode[m]}
          </button>
        );
      })}
    </div>
  );
}

function FooterKey({ hint, chord }: { hint: string; chord: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="px-1.5 py-[1.5px] rounded border border-line bg-ink-2/60 font-mono text-[10.5px] text-text-secondary">
        {chord}
      </kbd>
      <span className="text-text-tertiary">{hint}</span>
    </span>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <button
        onClick={onNew}
        className="press-feedback text-text-secondary hover:text-text-primary text-[13.5px] tracking-[-0.005em]"
      >
        Press <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[11.5px]">⌘T</kbd> to start a session
      </button>
    </div>
  );
}

/**
 * Shorten an absolute path by replacing $HOME with "~". Keeps the header
 * chip readable without losing the "which folder" context. The preload
 * doesn't expose HOME directly and Node env isn't available in the
 * renderer, so we heuristic-match /Users/<name>/… (macOS) and
 * C:\Users\<name>\… (Windows) and collapse to ~.
 */
function shortenHome(p: string): string {
  const macMatch = p.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (macMatch) return `~${macMatch[1] ?? ""}`;
  const winMatch = p.match(/^([A-Z]:\\Users\\[^\\]+)(\\.*)?$/);
  if (winMatch) return `~${(winMatch[2] ?? "").replace(/\\/g, "/")}`;
  return p;
}
