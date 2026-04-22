import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  File as FileIcon,
  Folder,
  Play,
  Plus,
  Search,
  Settings as SettingsIcon,
  SplitSquareVertical,
  TerminalSquare,
} from "lucide-react";
import { useProjects } from "@/store/projects";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { useAgent } from "@/store/agent";
import { useEditorUI } from "@/store/editor-ui";
import type { CockpitMode } from "@idex/types";
import { cn } from "@/lib/cn";

interface Item {
  id: string;
  label: string;
  sub?: string;
  hint?: string;
  section: "project" | "file" | "action";
  icon: React.ReactNode;
  run: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Open the Settings drawer. Lifted into Cockpit so the palette can
   *  trigger the same drawer that the gear icon + ⌘, shortcut open. */
  onOpenSettings?: () => void;
}

/**
 * The ⌘K command palette. A single flat list (projects + open files +
 * global actions), filtered on the user's query string. Arrow keys move
 * the selection, Enter runs it, Escape closes. No background click-to-
 * close hijinks per spec — the overlay catches the click and closes
 * only when the pointerdown is on the scrim itself.
 */
export function CommandPalette({ open, onClose, onOpenSettings }: Props) {
  const recents = useProjects((s) => s.recents);
  const openProject = useProjects((s) => s.openProject);
  const openFiles = useWorkspace((s) => s.openFiles);
  const setActive = useWorkspace((s) => s.setActive);
  const patchConfig = useSettings((s) => s.patch);
  const mode = useSettings((s) => s.config.mode);
  const selectedAgent = useSettings((s) => s.config.selectedAgent);
  const createSession = useAgent((s) => s.createSession);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // Global actions first — highest-traffic, always visible.
    out.push({
      id: "action:new-session",
      label: "New agent session",
      sub: "Spawn another Claude Code / Codex tab",
      hint: "⌘T",
      section: "action",
      icon: <Plus className="size-4" />,
      run: async () => {
        await createSession({ agentId: selectedAgent });
      },
    });

    const nextMode: CockpitMode = mode === "editor" ? "agent" : "editor";
    out.push({
      id: "action:toggle-mode",
      label: `Toggle mode → ${nextMode}`,
      sub: `Currently in ${mode} mode`,
      hint: "⌘E",
      section: "action",
      icon: <SplitSquareVertical className="size-4" />,
      run: () => patchConfig({ mode: nextMode }),
    });

    if (onOpenSettings) {
      out.push({
        id: "action:open-settings",
        label: "Open settings",
        sub: "Agent, keys, curator, privacy",
        hint: "⌘,",
        section: "action",
        icon: <SettingsIcon className="size-4" />,
        run: () => onOpenSettings(),
      });
    }

    out.push({
      id: "action:autopilot",
      label: "Run autopilot",
      sub: mode === "autopilot" ? "Return to agent" : "Hand the session to autopilot",
      hint: "⌘P",
      section: "action",
      icon: <Play className="size-4" />,
      run: () => {
        // Match the cockpit's ⌘P behavior: toggle in/out of autopilot mode.
        // The AutopilotLauncher (owned by another agent) renders inside that
        // mode and handles goal capture.
        const next: CockpitMode = mode === "autopilot" ? "agent" : "autopilot";
        void patchConfig({ mode: next });
      },
    });

    out.push({
      id: "action:terminal",
      label: "Toggle terminal",
      sub: "Open the integrated shell panel",
      hint: "⌘`",
      section: "action",
      icon: <TerminalSquare className="size-4" />,
      run: () => {
        useEditorUI.getState().toggleTerminal();
        if (useEditorUI.getState().terminalOpen && mode !== "editor") {
          void patchConfig({ mode: "editor" });
        }
      },
    });

    // Open files — jumping between buffers without leaving keyboard.
    for (const f of openFiles) {
      out.push({
        id: `file:${f.path}`,
        label: basename(f.path),
        sub: f.path,
        section: "file",
        icon: <FileIcon className="size-4" />,
        run: () => {
          setActive(f.path);
          void patchConfig({ mode: "editor" });
        },
      });
    }

    // Recent projects — usually the main reason to open the palette
    // when you're just spinning up the app.
    for (const p of recents) {
      out.push({
        id: `project:${p.path}`,
        label: p.label ?? basename(p.path),
        sub: p.path,
        section: "project",
        icon: <Folder className="size-4" />,
        run: () => void openProject(p.path, p.label),
      });
    }

    return out;
  }, [
    recents,
    openFiles,
    openProject,
    setActive,
    patchConfig,
    mode,
    selectedAgent,
    createSession,
    onOpenSettings,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.sub ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  // Reset selection when the filtered set changes so the highlight never
  // points at a stale index.
  useEffect(() => {
    setSelectedIdx(0);
  }, [query, items.length]);

  // Focus input on open; reset query on close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIdx(0);
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  // Keep the selected row scrolled into view on arrow-key movement.
  useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const row = ul.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[selectedIdx];
      if (!target) return;
      void target.run();
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4 bg-black/55 backdrop-blur-sm"
          onKeyDown={onKey}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.985 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-[640px] overflow-hidden rounded-xl border border-line bg-ink-1 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
              <Search className="size-4 text-text-tertiary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, files, commands…"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="flex-1 bg-transparent text-[14.5px] text-text-primary placeholder:text-text-tertiary/70 outline-none border-0 py-1 tracking-[-0.005em]"
              />
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px] text-text-tertiary shrink-0">
                esc
              </kbd>
            </div>

            <ul
              ref={listRef}
              role="listbox"
              aria-label="Command palette results"
              className="max-h-[420px] overflow-y-auto py-1"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-8 text-center text-[13px] text-text-tertiary tracking-[-0.005em]">
                  No matches.
                </li>
              ) : (
                filtered.map((it, idx) => {
                  const active = idx === selectedIdx;
                  return (
                    <li key={it.id} data-idx={idx} role="option" aria-selected={active}>
                      <button
                        onClick={() => {
                          void it.run();
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                          active ? "bg-accent-soft text-text-primary" : "hover:bg-ink-2 text-text-primary",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-md shrink-0 transition-colors",
                            active ? "bg-accent text-white" : "bg-ink-2 text-text-secondary",
                          )}
                        >
                          {it.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="text-[13.5px] font-medium truncate tracking-[-0.005em]">
                              {it.label}
                            </span>
                            <SectionTag section={it.section} />
                          </span>
                          {it.sub && (
                            <span
                              className={cn(
                                "block text-[11.5px] text-text-tertiary truncate",
                                it.section === "action"
                                  ? "tracking-[-0.005em]"
                                  : "font-mono",
                              )}
                            >
                              {it.sub}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {it.hint && (
                            <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px] text-text-tertiary">
                              {it.hint}
                            </kbd>
                          )}
                          {active && <ArrowRight className="size-3 text-accent" />}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-ink-2/50 px-3 py-2 text-[11.5px] text-text-tertiary tracking-[-0.005em]">
              <div className="flex items-center gap-3.5">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px]">↑↓</kbd>
                  Navigate
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px]">↵</kbd>
                  Run
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px]">esc</kbd>
                Close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionTag({ section }: { section: Item["section"] }) {
  const label = section === "project" ? "Project" : section === "file" ? "File" : "Action";
  return (
    <span className="text-[10.5px] text-text-tertiary tracking-[-0.005em]">
      {label}
    </span>
  );
}

function basename(p: string): string {
  const norm = p.replace(/\\+/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
