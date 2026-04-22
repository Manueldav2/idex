import { useEffect, useState } from "react";
import { FolderPlus, PanelLeftClose, PanelLeftOpen, Folder, File as FileIcon, X, ChevronDown, ChevronRight } from "lucide-react";
import { FileTree } from "./editor/FileTree";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import type { CockpitMode } from "@idex/types";
import { cn } from "@/lib/cn";

/**
 * The always-on left dock. Collapsible Cursor-style: click the chevron
 * to shrink to a 44px rail that shows a single folder icon. Click again
 * to expand back to the full 220px file tree.
 *
 * Width is persisted in local state for the session; future iteration
 * can persist to AppConfig for cross-launch memory.
 */
interface Props {
  mode: CockpitMode;
}

const EXPANDED_W = 220;
const COLLAPSED_W = 44;

export function Sidebar({ mode }: Props) {
  const tree = useWorkspace((s) => s.tree);
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const loadWorkspace = useWorkspace((s) => s.loadWorkspace);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const persistedPath = useSettings((s) => s.config.workspacePath);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (persistedPath && !workspacePath) {
      void loadWorkspace(persistedPath);
    }
  }, [persistedPath, workspacePath, loadWorkspace]);

  // Global keyboard shortcut to toggle the sidebar (⌘B matches Cursor/VSCode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const width = collapsed ? COLLAPSED_W : EXPANDED_W;
  const folderLabel = workspacePath
    ? workspacePath.split("/").filter(Boolean).slice(-1)[0] ?? "workspace"
    : null;

  return (
    <aside
      style={{
        width,
        transition: "width 220ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
      className="flex h-full flex-col bg-ink-1 border-r border-line shrink-0 min-w-0 overflow-hidden"
      data-cockpit-mode={mode}
    >
      {/* Header row with the current workspace label + collapse toggle */}
      <div
        className="flex items-center justify-between gap-1.5 px-3 h-10 border-b border-line"
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Folder className="size-3.5 text-text-tertiary shrink-0" />
            <span
              className="text-[12.5px] text-text-secondary truncate tracking-[-0.005em]"
              title={workspacePath ?? "no workspace"}
            >
              {folderLabel ?? "Workspace"}
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="tt press-feedback p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-ink-2 transition-colors shrink-0"
          data-tooltip={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          data-tooltip-pos="bottom"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </div>

      {collapsed ? (
        <CollapsedRail
          hasWorkspace={!!workspacePath}
          onOpen={() => void openWorkspace()}
        />
      ) : tree ? (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <OpenEditorsSection />
          <FileTree tree={tree} />
        </div>
      ) : (
        <EmptySidebar onOpenFolder={() => void openWorkspace()} />
      )}
    </aside>
  );
}

/**
 * Cursor-style "Open editors" pane at the top of the sidebar. Lists every
 * buffer the user has open and lets them close files without jumping up
 * to the editor tab bar. Collapsible; hidden entirely when nothing is
 * open so we don't waste vertical space on an empty section.
 */
function OpenEditorsSection() {
  const openFiles = useWorkspace((s) => s.openFiles);
  const activePath = useWorkspace((s) => s.activePath);
  const setActive = useWorkspace((s) => s.setActive);
  const closeFile = useWorkspace((s) => s.closeFile);
  const patchConfig = useSettings((s) => s.patch);
  const [expanded, setExpanded] = useState(true);

  if (openFiles.length === 0) return null;

  return (
    <div className="border-b border-line shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 h-7 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors tracking-[-0.005em]"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className="font-medium">Open editors</span>
        <span className="ml-1 text-text-tertiary/70 tabular-nums font-mono text-[10.5px]">
          {openFiles.length}
        </span>
      </button>
      {expanded && (
        <ul className="pb-1">
          {openFiles.map((f) => {
            const active = f.path === activePath;
            const name = basename(f.path);
            return (
              <li key={f.path} className="group relative">
                <button
                  onClick={() => {
                    setActive(f.path);
                    // Snap into editor mode so clicking here from agent
                    // mode actually takes you to the file.
                    void patchConfig({ mode: "editor" });
                  }}
                  title={f.path}
                  className={cn(
                    "w-full flex items-center gap-1.5 pl-6 pr-8 py-0.5 text-left text-[12.5px] transition-colors tracking-[-0.005em]",
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-ink-2/60",
                  )}
                >
                  {f.dirty ? (
                    <span
                      className="size-1.5 rounded-full bg-accent shrink-0"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  ) : (
                    <FileIcon className="size-3 shrink-0 text-text-tertiary" />
                  )}
                  <span className="truncate">{name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(f.path);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-ink-0 transition-opacity"
                  title="Close file"
                  aria-label={`Close ${name}`}
                >
                  <X className="size-3 text-text-tertiary hover:text-text-primary" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function basename(p: string): string {
  const norm = p.replace(/\\+/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** 44px-wide rail shown when the sidebar is collapsed. One icon button. */
function CollapsedRail({
  hasWorkspace,
  onOpen,
}: {
  hasWorkspace: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center py-3 gap-2">
      {!hasWorkspace && (
        <button
          onClick={onOpen}
          className="tt press-feedback p-1.5 rounded-md text-text-secondary hover:text-accent hover:bg-ink-2 transition-colors"
          data-tooltip="open folder"
          data-tooltip-pos="bottom"
          aria-label="Open folder"
        >
          <FolderPlus className="size-4" />
        </button>
      )}
    </div>
  );
}

function EmptySidebar({ onOpenFolder }: { onOpenFolder: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-[13px] text-text-secondary leading-relaxed max-w-[180px] tracking-[-0.005em]">
        No folder open yet. Open one to start editing.
      </p>
      <button
        onClick={onOpenFolder}
        className="press-feedback inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] text-text-primary bg-ink-2 hover:bg-ink-2/70 border border-line hover:border-line-soft transition-colors"
      >
        <FolderPlus className="size-3.5" /> Open folder
      </button>
    </div>
  );
}
