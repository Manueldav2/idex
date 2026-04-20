import { useEffect, useState } from "react";
import { FolderPlus, PanelLeftClose, PanelLeftOpen, Folder } from "lucide-react";
import { FileTree } from "./editor/FileTree";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import type { CockpitMode } from "@idex/types";

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
        className="flex items-center justify-between gap-1 px-2.5 h-9 border-b border-line"
        style={{ minHeight: "36px" }}
      >
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Folder className="size-3.5 text-text-secondary shrink-0" />
            <span
              className="text-[11px] font-mono text-text-secondary truncate"
              title={workspacePath ?? "no workspace"}
            >
              {folderLabel ?? "workspace"}
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="tt press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors shrink-0"
          data-tooltip={collapsed ? "expand sidebar (⌘B)" : "collapse sidebar (⌘B)"}
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
        <div className="flex-1 overflow-y-auto">
          <FileTree tree={tree} />
        </div>
      ) : (
        <EmptySidebar onOpenFolder={() => void openWorkspace()} />
      )}
    </aside>
  );
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
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="text-[10px] uppercase tracking-[0.24em] font-mono text-text-secondary">
        workspace
      </span>
      <p className="text-[11px] text-text-secondary font-mono leading-relaxed max-w-[170px]">
        no folder open yet.
      </p>
      <button
        onClick={onOpenFolder}
        className="press-feedback inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-mono text-text-primary bg-ink-2 border border-line hover:border-accent hover:text-accent transition-colors"
      >
        <FolderPlus className="size-3.5" /> open folder
      </button>
    </div>
  );
}
