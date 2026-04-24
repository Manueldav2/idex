import { useEffect, useState } from "react";
import { useScm } from "@/store/scm";
import { useWorkspace } from "@/store/workspace";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommit,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { GitFileStatus } from "@idex/types";
import { cn } from "@/lib/cn";

/**
 * Source-control panel — VS Code-style ⌘⇧G.
 *
 * Three groups (Staged / Changes / Untracked) above a commit input
 * that defaults to "stage all + commit" if nothing's staged. Selecting
 * a file in any group renders its diff in the editor as a temporary
 * read-only view. The branch name + ahead/behind sit in the header
 * with a refresh button.
 */
export function ScmPanel() {
  const branch = useScm((s) => s.branch);
  const ahead = useScm((s) => s.ahead);
  const behind = useScm((s) => s.behind);
  const groups = useScm((s) => s.groups);
  const error = useScm((s) => s.error);
  const loading = useScm((s) => s.loading);
  const initialized = useScm((s) => s.initialized);
  const message = useScm((s) => s.message);
  const setMessage = useScm((s) => s.setMessage);
  const refresh = useScm((s) => s.refresh);
  const stage = useScm((s) => s.stage);
  const unstage = useScm((s) => s.unstage);
  const commit = useScm((s) => s.commit);
  const pull = useScm((s) => s.pull);
  const push = useScm((s) => s.push);
  const selectedPath = useScm((s) => s.selectedPath);
  const selectFile = useScm((s) => s.selectFile);
  const workspacePath = useWorkspace((s) => s.workspacePath);

  // Initial fetch on mount, plus refresh when workspace changes.
  useEffect(() => {
    void refresh();
    // Light auto-refresh — every 8s while panel is mounted. Cheap.
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [refresh, workspacePath]);

  const total = groups.staged.length + groups.changes.length + groups.untracked.length;
  const nothingStaged = groups.staged.length === 0;
  const canCommit = message.trim().length > 0 && (groups.staged.length > 0 || total > 0);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-ink-1">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-[0.06em]">
          Source Control
        </span>
        <button
          onClick={() => void refresh()}
          title="Refresh"
          className="press-feedback p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-ink-2 transition-colors"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>
      </header>

      {/* Branch + ahead/behind */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line text-[12px]">
        {branch ? (
          <>
            <GitBranch className="size-3.5 text-text-tertiary" />
            <span className="text-text-primary truncate">{branch}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="ml-auto flex items-center gap-2 text-text-tertiary tabular-nums">
                {behind > 0 && (
                  <button
                    onClick={() => void pull()}
                    title={`Pull ${behind} commit${behind === 1 ? "" : "s"}`}
                    className="press-feedback inline-flex items-center gap-0.5 hover:text-text-primary transition-colors"
                  >
                    <ArrowDownToLine className="size-3" />
                    {behind}
                  </button>
                )}
                {ahead > 0 && (
                  <button
                    onClick={() => void push()}
                    title={`Push ${ahead} commit${ahead === 1 ? "" : "s"}`}
                    className="press-feedback inline-flex items-center gap-0.5 hover:text-text-primary transition-colors"
                  >
                    <ArrowUpFromLine className="size-3" />
                    {ahead}
                  </button>
                )}
              </span>
            )}
          </>
        ) : initialized ? (
          <span className="text-text-tertiary text-[11.5px]">Not a git repository</span>
        ) : (
          <span className="text-text-tertiary text-[11.5px]">Loading…</span>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11.5px] text-error font-mono leading-relaxed border-b border-line bg-error/5">
          {error}
        </div>
      )}

      {/* Commit message input */}
      {branch && (
        <div className="px-3 py-2 border-b border-line space-y-1.5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommit) {
                e.preventDefault();
                void commit({ stageAll: nothingStaged });
              }
            }}
            placeholder={
              nothingStaged && total > 0
                ? "Message (⌘↵ to commit all)"
                : "Message (⌘↵ to commit)"
            }
            rows={2}
            className="w-full resize-none rounded-md bg-ink-2 border border-line px-2.5 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-tertiary/70 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <button
            onClick={() => void commit({ stageAll: nothingStaged })}
            disabled={!canCommit}
            className="press-feedback w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-white px-2 py-1.5 text-[12px] font-medium hover:brightness-110 transition-[filter] disabled:opacity-40 disabled:pointer-events-none"
          >
            <GitCommit className="size-3.5" />
            {nothingStaged && total > 0 ? "Commit all" : "Commit"}
          </button>
        </div>
      )}

      {/* Groups */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.staged.length > 0 && (
          <Group
            title="Staged Changes"
            files={groups.staged}
            kind="staged"
            selectedPath={selectedPath}
            onSelect={(p, staged) => void selectFile(p, staged)}
            onUnstage={(p) => void unstage([p])}
            onUnstageAll={() => void unstage(groups.staged.map((f) => f.path))}
          />
        )}
        {groups.changes.length > 0 && (
          <Group
            title="Changes"
            files={groups.changes}
            kind="changes"
            selectedPath={selectedPath}
            onSelect={(p, staged) => void selectFile(p, staged)}
            onStage={(p) => void stage([p])}
            onStageAll={() => void stage(groups.changes.map((f) => f.path))}
          />
        )}
        {groups.untracked.length > 0 && (
          <Group
            title="Untracked"
            files={groups.untracked}
            kind="untracked"
            selectedPath={selectedPath}
            onSelect={(p, staged) => void selectFile(p, staged)}
            onStage={(p) => void stage([p])}
            onStageAll={() => void stage(groups.untracked.map((f) => f.path))}
          />
        )}
        {initialized && total === 0 && branch && (
          <div className="px-3 py-6 text-[12px] text-text-tertiary text-center">
            Working tree clean.
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  files,
  kind,
  selectedPath,
  onSelect,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
}: {
  title: string;
  files: GitFileStatus[];
  kind: "staged" | "changes" | "untracked";
  selectedPath: string | null;
  onSelect: (path: string, staged: boolean) => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const staged = kind === "staged";

  return (
    <div className="border-b border-line/60 last:border-b-0">
      <div className="flex items-center gap-1 px-3 py-1.5 group">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          {collapsed ? (
            <ChevronRight className="size-3 text-text-tertiary shrink-0" />
          ) : (
            <ChevronDown className="size-3 text-text-tertiary shrink-0" />
          )}
          <span className="text-[10.5px] font-medium text-text-tertiary uppercase tracking-[0.06em] truncate">
            {title}
          </span>
        </button>
        <span className="text-[10.5px] text-text-tertiary tabular-nums">{files.length}</span>
        {staged
          ? onUnstageAll && (
              <button
                onClick={onUnstageAll}
                title="Unstage all"
                className="press-feedback p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-ink-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Minus className="size-3" />
              </button>
            )
          : onStageAll && (
              <button
                onClick={onStageAll}
                title="Stage all"
                className="press-feedback p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-ink-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Plus className="size-3" />
              </button>
            )}
      </div>
      {!collapsed &&
        files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            staged={staged}
            selected={selectedPath === f.path}
            onSelect={() => onSelect(f.path, staged)}
            onStage={onStage ? () => onStage(f.path) : undefined}
            onUnstage={onUnstage ? () => onUnstage(f.path) : undefined}
          />
        ))}
    </div>
  );
}

function FileRow({
  file,
  staged,
  selected,
  onSelect,
  onStage,
  onUnstage,
}: {
  file: GitFileStatus;
  staged: boolean;
  selected: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
}) {
  const fileName = file.path.split("/").pop() ?? file.path;
  const dir = file.path.slice(0, file.path.length - fileName.length).replace(/\/$/, "");
  const code = staged ? file.index : file.workingTree;
  const codeColor = statusColor(code);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 pl-7 pr-2 py-0.5 group cursor-pointer transition-colors",
        selected ? "bg-accent/15" : "hover:bg-ink-2/60",
      )}
      onClick={onSelect}
    >
      <span className="text-[12px] text-text-primary truncate">{fileName}</span>
      {dir && <span className="text-[11px] text-text-tertiary truncate">{dir}</span>}
      <span className={cn("ml-auto text-[10.5px] font-mono tabular-nums shrink-0", codeColor)}>
        {code}
      </span>
      {staged
        ? onUnstage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnstage();
              }}
              title="Unstage"
              className="press-feedback p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-ink-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Minus className="size-3" />
            </button>
          )
        : onStage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStage();
              }}
              title="Stage"
              className="press-feedback p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-ink-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Plus className="size-3" />
            </button>
          )}
    </div>
  );
}

function statusColor(code: string): string {
  switch (code) {
    case "M":
      return "text-amber-400/80";
    case "A":
      return "text-emerald-400/80";
    case "D":
      return "text-error";
    case "R":
      return "text-cyan-400/80";
    case "?":
      return "text-emerald-400/60";
    default:
      return "text-text-tertiary";
  }
}
