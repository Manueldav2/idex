import { useEffect } from "react";
import { useWorkspace } from "@/store/workspace";
import { useSettings } from "@/store/settings";
import { useEditorUI } from "@/store/editor-ui";
import { FileTree } from "./FileTree";
import { EditorTabs } from "./EditorTabs";
import { Editor } from "./Editor";
import { TerminalPanel } from "./TerminalPanel";
import { FolderPlus, TerminalSquare } from "lucide-react";

export function EditorMode() {
  const workspacePath = useWorkspace((s) => s.workspacePath);
  const tree = useWorkspace((s) => s.tree);
  const openFiles = useWorkspace((s) => s.openFiles);
  const activePath = useWorkspace((s) => s.activePath);
  const loadWorkspace = useWorkspace((s) => s.loadWorkspace);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const persistedPath = useSettings((s) => s.config.workspacePath);
  const terminalOpen = useEditorUI((s) => s.terminalOpen);
  const setTerminalOpen = useEditorUI((s) => s.setTerminalOpen);

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
      <div className="relative flex h-full flex-1 flex-col min-w-0 min-h-0 bg-ink-0">
        <div className="flex-1 min-h-0 flex flex-col">
          <EditorTabs />
          {activeFile ? (
            <Editor file={activeFile} />
          ) : (
            <EmptyEditorState hasWorkspace={!!tree} onOpenFolder={() => void openWorkspace()} />
          )}
        </div>
        {/*
          Integrated terminal — Cursor-style bottom panel. Mounts only
          while open; sessions persist via useAgent so toggling off/on
          doesn't kill the shell.
        */}
        <TerminalPanel open={terminalOpen} onClose={() => setTerminalOpen(false)} />
        {!terminalOpen && (
          <button
            onClick={() => setTerminalOpen(true)}
            title="Open terminal (⌘`)"
            className="press-feedback absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-line bg-ink-1/80 backdrop-blur-md px-2.5 py-1.5 text-[12px] text-text-secondary hover:text-text-primary hover:border-line-soft transition-colors"
          >
            <TerminalSquare className="size-3.5" />
            Terminal
            <kbd className="ml-1 px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px] text-text-tertiary">
              ⌘`
            </kbd>
          </button>
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
      <div className="flex flex-col items-center gap-3 text-center px-8 max-w-sm">
        {hasWorkspace ? (
          <p className="text-[13.5px] text-text-secondary leading-relaxed tracking-[-0.005em]">
            Select a file from the tree to begin.
            <br />
            <span className="text-text-tertiary">
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px]">⌘S</kbd>{" "}
              save,{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono text-[10.5px]">⌘E</kbd>{" "}
              back to the agent.
            </span>
          </p>
        ) : (
          <>
            <p className="text-[13.5px] text-text-secondary leading-relaxed tracking-[-0.005em]">
              Open a folder to start editing.
            </p>
            <button
              onClick={onOpenFolder}
              className="press-feedback inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] text-text-primary bg-ink-2 border border-line hover:border-line-soft transition-colors"
            >
              <FolderPlus className="size-3.5" /> Open folder
            </button>
          </>
        )}
      </div>
    </div>
  );
}
