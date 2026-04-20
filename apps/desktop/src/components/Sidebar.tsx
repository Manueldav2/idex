import { useEffect } from "react";
import { FolderPlus } from "lucide-react";
import { FileTree } from "./editor/FileTree";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import type { CockpitMode } from "@idex/types";

/**
 * The always-on left dock for the cockpit. Renders the shared FileTree so the
 * user can see their workspace whether they're in Agent mode or Editor mode.
 *
 * Behavior:
 *   - Clicking a file in the tree opens it AND snaps the cockpit into Editor
 *     mode (so the newly opened file has somewhere to render). This mirrors
 *     what Cursor / VS Code do when you click a file from an adjacent panel.
 *   - When the user is in Editor mode, we show a thinner header label so
 *     the two-panel composition still feels intentional.
 */
interface Props {
  mode: CockpitMode;
}

export function Sidebar({ mode }: Props) {
  const tree = useWorkspace((s) => s.tree);
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const loadWorkspace = useWorkspace((s) => s.loadWorkspace);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const persistedPath = useSettings((s) => s.config.workspacePath);

  // Rehydrate the tree on first render if we have a persisted path but the
  // workspace store hasn't loaded yet. This makes the Sidebar self-sufficient
  // — previously only EditorMode did this, so the tree was blank for users
  // in Agent mode until they flipped to Editor first.
  useEffect(() => {
    if (persistedPath && !workspacePath) {
      void loadWorkspace(persistedPath);
    }
  }, [persistedPath, workspacePath, loadWorkspace]);

  return (
    <aside
      style={{ width: "220px" }}
      className="flex h-full flex-col bg-ink-1 border-r border-line shrink-0 min-w-0"
      data-cockpit-mode={mode}
    >
      {tree ? (
        <FileTree tree={tree} />
      ) : (
        <EmptySidebar onOpenFolder={() => void openWorkspace()} />
      )}
    </aside>
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
