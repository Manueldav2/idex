import { useMemo, useState } from "react";
import type { FileNode } from "@idex/types";
import { useWorkspace } from "@/store/workspace";
import { ChevronRight, File as FileIcon, Folder, FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  tree: FileNode | null;
}

export function FileTree({ tree }: Props) {
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const refreshTree = useWorkspace((s) => s.refreshTree);
  const loadingTree = useWorkspace((s) => s.loadingTree);
  const treeError = useWorkspace((s) => s.treeError);

  if (!tree) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="text-[10px] uppercase tracking-[0.24em] font-mono text-text-secondary">
          editor
        </span>
        <p className="text-[12px] text-text-secondary font-mono leading-relaxed">
          open a folder to start editing
        </p>
        <button
          onClick={() => void openWorkspace()}
          className="press-feedback inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-mono text-text-primary bg-ink-2 border border-line hover:border-accent hover:text-accent transition-colors"
        >
          <FolderPlus className="size-3.5" /> open folder
        </button>
        {treeError && (
          <span className="text-[11px] text-error font-mono max-w-[200px] truncate" title={treeError}>
            {treeError}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line shrink-0">
        <span
          className="text-[11px] font-mono text-text-primary truncate"
          title={tree.path}
        >
          {tree.name}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void refreshTree()}
            className="press-feedback p-1 rounded text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("size-3", loadingTree && "animate-spin")} />
          </button>
          <button
            onClick={() => void openWorkspace()}
            className="press-feedback p-1 rounded text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            title="Open another folder"
          >
            <FolderPlus className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        <ul className="flex flex-col">
          {(tree.children ?? []).map((child) => (
            <TreeNode key={child.path} node={child} depth={0} />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface NodeProps {
  node: FileNode;
  depth: number;
}

function TreeNode({ node, depth }: NodeProps) {
  const openFile = useWorkspace((s) => s.openFile);
  const activePath = useWorkspace((s) => s.activePath);
  const openFiles = useWorkspace((s) => s.openFiles);

  // Directories default to collapsed so the tree stays scannable.
  const [expanded, setExpanded] = useState(false);

  const isOpen = useMemo(
    () => openFiles.some((f) => f.path === node.path),
    [openFiles, node.path],
  );
  const isActive = activePath === node.path;

  const indent = { paddingLeft: `${12 + depth * 12}px` };

  if (node.kind === "dir") {
    return (
      <li>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={indent}
          className={cn(
            "w-full flex items-center gap-1.5 pr-2 py-1 text-left font-mono text-[12px] transition-colors",
            "text-text-secondary hover:text-text-primary hover:bg-ink-2/60",
          )}
          title={node.path}
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {expanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-accent" />
          ) : (
            <Folder className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <ul className="flex flex-col">
            {(node.children ?? []).length === 0 ? (
              <li
                style={{ paddingLeft: `${12 + (depth + 1) * 12 + 16}px` }}
                className="py-0.5 text-[11px] font-mono text-text-secondary/50"
              >
                (empty)
              </li>
            ) : (
              node.children!.map((child) => (
                <TreeNode key={child.path} node={child} depth={depth + 1} />
              ))
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => void openFile(node.path)}
        style={indent}
        className={cn(
          "w-full flex items-center gap-1.5 pr-2 py-1 text-left font-mono text-[12px] transition-colors",
          isActive
            ? "bg-accent-soft text-accent"
            : isOpen
              ? "text-text-primary hover:bg-ink-2/60"
              : "text-text-secondary hover:text-text-primary hover:bg-ink-2/60",
        )}
        title={node.path}
      >
        <span className="size-3 shrink-0" />
        <FileIcon className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
