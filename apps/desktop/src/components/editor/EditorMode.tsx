import { useEffect } from "react";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { FileTree } from "./FileTree";
import { EditorTabs } from "./EditorTabs";
import { Editor } from "./Editor";
import { FolderPlus } from "lucide-react";

export function EditorMode() {
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const tree = useWorkspace((s) => s.tree);
  const openFiles = useWorkspace((s) => s.openFiles);
  const activePath = useWorkspace((s) => s.activePath);
  const loadWorkspace = useWorkspace((s) => s.loadWorkspace);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const persistedPath = useSettings((s) => s.config.workspacePath);

  // When entering editor mode, if the config has a workspace path but we
  // haven't loaded a tree yet, rehydrate it.
  useEffect(() => {
    if (persistedPath && !workspacePath) {
      void loadWorkspace(persistedPath);
    }
  }, [persistedPath, workspacePath, loadWorkspace]);

  const activeFile = activePath ? openFiles.find((f) => f.path === activePath) ?? null : null;

  return (
    <div className="flex h-full w-full min-h-0">
      <aside
        style={{ width: "240px" }}
        className="flex h-full flex-col bg-ink-1 border-r border-line shrink-0 min-w-0"
      >
        <FileTree tree={tree} />
      </aside>
      <div className="flex h-full flex-1 flex-col min-w-0 min-h-0 bg-ink-0">
        <EditorTabs />
        {activeFile ? (
          <Editor file={activeFile} />
        ) : (
          <EmptyEditorState hasWorkspace={!!tree} onOpenFolder={() => void openWorkspace()} />
        )}
      </div>
    </div>
  );
}

function EmptyEditorState({
  hasWorkspace,
  onOpenFolder,
}: {
  hasWorkspace: boolean;
  onOpenFolder: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center min-h-0">
      <div className="flex flex-col items-center gap-3 text-center px-8">
        <span className="text-[10px] uppercase tracking-[0.24em] font-mono text-text-secondary">
          editor
        </span>
        {hasWorkspace ? (
          <p className="text-[12px] font-mono text-text-secondary max-w-sm leading-relaxed">
            select a file from the tree to begin.<br />
            <span className="text-text-secondary/60">
              press{" "}
              <kbd className="px-1 py-0.5 rounded border border-line">⌘S</kbd>
              {" "}to save, <kbd className="px-1 py-0.5 rounded border border-line">⌘E</kbd>
              {" "}to return to the agent.
            </span>
          </p>
        ) : (
          <>
            <p className="text-[12px] font-mono text-text-secondary max-w-sm leading-relaxed">
              open a folder to start editing.
            </p>
            <button
              onClick={onOpenFolder}
              className="press-feedback inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-mono text-text-primary bg-ink-2 border border-line hover:border-accent hover:text-accent transition-colors"
            >
              <FolderPlus className="size-3.5" /> open folder
            </button>
          </>
        )}
      </div>
    </div>
  );
}
