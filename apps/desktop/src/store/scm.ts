import { create } from "zustand";
import type { GitFileStatus, GitStatusResult } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useSettings } from "./settings";
import { useWorkspace } from "./workspace";

/**
 * Source-control store. Mirrors VS Code's SCM panel state model:
 *   - one current "input" string (the pending commit message)
 *   - status snapshot grouped into staged / changes / untracked
 *   - currently-selected file (drives the diff pane)
 *   - last error from a git op
 *
 * Auto-refresh on workspace change. The renderer SCM panel pings
 * `refresh()` when it mounts and after every stage/commit operation.
 */

export interface ScmGroups {
  staged: GitFileStatus[];
  changes: GitFileStatus[];
  untracked: GitFileStatus[];
}

interface ScmStore {
  branch: string | null;
  ahead: number;
  behind: number;
  groups: ScmGroups;
  selectedPath: string | null;
  selectedStaged: boolean;
  diff: string;
  diffLoading: boolean;
  message: string;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  refresh: () => Promise<void>;
  selectFile: (path: string | null, staged?: boolean) => Promise<void>;
  setMessage: (m: string) => void;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  commit: (opts?: { stageAll?: boolean }) => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
}

function workspaceRoot(): string | null {
  return (
    useWorkspace.getState().workspacePath ??
    useSettings.getState().config.workspacePath ??
    null
  );
}

function groupFiles(files: GitFileStatus[]): ScmGroups {
  const staged: GitFileStatus[] = [];
  const changes: GitFileStatus[] = [];
  const untracked: GitFileStatus[] = [];
  for (const f of files) {
    if (f.index === "?") {
      untracked.push(f);
    } else {
      if (f.staged) staged.push(f);
      if (f.workingTree !== "." && f.workingTree !== "?") changes.push(f);
    }
  }
  // Stable sort by path inside each group.
  for (const g of [staged, changes, untracked]) g.sort((a, b) => a.path.localeCompare(b.path));
  return { staged, changes, untracked };
}

function applyStatus(s: GitStatusResult): Partial<ScmStore> {
  if (!s.ok) {
    return {
      branch: null,
      ahead: 0,
      behind: 0,
      groups: { staged: [], changes: [], untracked: [] },
      error: s.error ?? null,
      initialized: true,
    };
  }
  return {
    branch: s.branch,
    ahead: s.ahead,
    behind: s.behind,
    groups: groupFiles(s.files),
    error: null,
    initialized: true,
  };
}

export const useScm = create<ScmStore>((set, get) => ({
  branch: null,
  ahead: 0,
  behind: 0,
  groups: { staged: [], changes: [], untracked: [] },
  selectedPath: null,
  selectedStaged: false,
  diff: "",
  diffLoading: false,
  message: "",
  loading: false,
  error: null,
  initialized: false,

  async refresh() {
    const root = workspaceRoot();
    if (!root) {
      set({ initialized: true, error: "No workspace open" });
      return;
    }
    set({ loading: true });
    try {
      const status = await ipc().scm.status(root);
      set({ ...applyStatus(status), loading: false });

      // If the currently-selected file disappeared, clear the diff pane.
      const { selectedPath, groups } = get();
      if (selectedPath) {
        const all = [...groups.staged, ...groups.changes, ...groups.untracked].map((f) => f.path);
        if (!all.includes(selectedPath)) {
          set({ selectedPath: null, diff: "" });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: message });
    }
  },

  async selectFile(path, staged = false) {
    if (path === null) {
      set({ selectedPath: null, diff: "", diffLoading: false });
      return;
    }
    const root = workspaceRoot();
    if (!root) return;
    set({ selectedPath: path, selectedStaged: staged, diffLoading: true });
    try {
      const r = await ipc().scm.diff(root, path, staged);
      // Skip stale results.
      if (get().selectedPath !== path || get().selectedStaged !== staged) return;
      set({ diff: r.ok ? r.diff : `(diff failed: ${r.error ?? "unknown"})`, diffLoading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ diff: `(error: ${message})`, diffLoading: false });
    }
  },

  setMessage(m) {
    set({ message: m });
  },

  async stage(paths) {
    const root = workspaceRoot();
    if (!root || paths.length === 0) return;
    const r = await ipc().scm.stage(root, { paths, stage: true });
    if (!r.ok) set({ error: r.error ?? "Stage failed" });
    await get().refresh();
  },

  async unstage(paths) {
    const root = workspaceRoot();
    if (!root || paths.length === 0) return;
    const r = await ipc().scm.stage(root, { paths, stage: false });
    if (!r.ok) set({ error: r.error ?? "Unstage failed" });
    await get().refresh();
  },

  async commit(opts) {
    const root = workspaceRoot();
    const message = get().message.trim();
    if (!root || !message) {
      set({ error: !message ? "Commit message is empty" : "No workspace" });
      return;
    }
    set({ loading: true });
    const r = await ipc().scm.commit(root, { message, stageAll: opts?.stageAll ?? false });
    if (!r.ok) {
      set({ loading: false, error: r.error ?? "Commit failed" });
      return;
    }
    set({ message: "", loading: false, error: null });
    await get().refresh();
  },

  async pull() {
    const root = workspaceRoot();
    if (!root) return;
    set({ loading: true });
    const r = await ipc().scm.run(root, "pull");
    set({ loading: false, error: r.ok ? null : r.error ?? "Pull failed" });
    await get().refresh();
  },

  async push() {
    const root = workspaceRoot();
    if (!root) return;
    set({ loading: true });
    const r = await ipc().scm.run(root, "push");
    set({ loading: false, error: r.ok ? null : r.error ?? "Push failed" });
    await get().refresh();
  },
}));
