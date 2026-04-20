import { create } from "zustand";
import { RECENT_PROJECTS_MAX, type FileNode, type RecentProject } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useSettings } from "./settings";

/**
 * Shared helper: bump `path` to the head of a recents list, drop LRU over
 * the cap. Exported so the projects store can reuse the exact same logic
 * (and we have a single source of truth for ordering).
 */
function bumpRecents(
  current: RecentProject[],
  path: string,
  now: number,
): RecentProject[] {
  const existing = current.find((p) => p.path === path);
  const next: RecentProject = existing
    ? { ...existing, lastOpened: now }
    : { path, lastOpened: now };
  const rest = current.filter((p) => p.path !== path);
  return [next, ...rest].slice(0, RECENT_PROJECTS_MAX);
}

export interface OpenFile {
  path: string;
  /** The on-disk content when the file was last loaded or saved. */
  baseline: string;
  /** The current editor buffer. When it differs from baseline, the tab is dirty. */
  content: string;
  dirty: boolean;
  modelLanguage: string;
}

interface WorkspaceStore {
  workspacePath: string | null;
  tree: FileNode | null;
  openFiles: OpenFile[];
  activePath: string | null;
  loadingTree: boolean;
  treeError: string | null;

  /** Prompt user for a folder, open it, and load the tree. */
  openWorkspace: () => Promise<void>;
  /** Load (or reload) an already-known workspace path. */
  loadWorkspace: (rootPath: string) => Promise<void>;
  /** Refresh the tree from disk (no picker). */
  refreshTree: () => Promise<void>;

  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  save: (path: string) => Promise<{ ok: boolean; error?: string }>;
}

function languageFromPath(p: string): string {
  const ext = (p.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "markdown":
      return "markdown";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "less":
      return "less";
    case "html":
    case "htm":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "ini"; // monaco has no native toml; ini is close
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "py":
      return "python";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "sql":
      return "sql";
    case "xml":
      return "xml";
    case "svg":
      return "xml";
    case "dockerfile":
      return "dockerfile";
    default:
      return "plaintext";
  }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  workspacePath: null,
  tree: null,
  openFiles: [],
  activePath: null,
  loadingTree: false,
  treeError: null,

  async openWorkspace() {
    const result = await ipc().workspace.open();
    if (!result) return;
    await get().loadWorkspace(result.path);
    // Bump into recents + persist active path in one patch so the launcher
    // and sidebar stay in sync when the user opens via the OS picker.
    const settings = useSettings.getState();
    const currentRecents = settings.config.recentProjects ?? [];
    const nextRecents = bumpRecents(currentRecents, result.path, Date.now());
    await settings.patch({
      workspacePath: result.path,
      recentProjects: nextRecents,
    });
  },

  async loadWorkspace(rootPath) {
    set({ loadingTree: true, treeError: null, workspacePath: rootPath });
    try {
      const tree = await ipc().workspace.tree(rootPath);
      if (!tree) {
        set({ treeError: "Could not read folder", loadingTree: false });
        return;
      }
      set({ tree, loadingTree: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ treeError: message, loadingTree: false });
    }
  },

  async refreshTree() {
    const root = get().workspacePath;
    if (!root) return;
    await get().loadWorkspace(root);
  },

  async openFile(path) {
    // Opening a file is a commitment to look at it, so snap the cockpit into
    // Editor mode. When the Sidebar is visible in Agent mode this is what
    // "click a file → see it in the editor" expects; when already in Editor
    // mode the patch is a no-op (mode === "editor" early-returns inside
    // Cockpit's setMode). Fire-and-forget so we don't stall the read.
    const settings = useSettings.getState();
    if (settings.config.mode !== "editor") {
      void settings.patch({ mode: "editor" });
    }

    const existing = get().openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activePath: path });
      return;
    }
    const res = await ipc().workspace.readFile(path);
    if (!res.ok || typeof res.content !== "string") {
      console.error("[workspace] readFile failed", path, res.error);
      return;
    }
    const file: OpenFile = {
      path,
      baseline: res.content,
      content: res.content,
      dirty: false,
      modelLanguage: languageFromPath(path),
    };
    set((s) => ({
      openFiles: [...s.openFiles, file],
      activePath: path,
    }));
  },

  closeFile(path) {
    set((s) => {
      const remaining = s.openFiles.filter((f) => f.path !== path);
      let nextActive = s.activePath;
      if (s.activePath === path) {
        const closingIdx = s.openFiles.findIndex((f) => f.path === path);
        const fallback = remaining[closingIdx] ?? remaining[closingIdx - 1] ?? remaining[0] ?? null;
        nextActive = fallback ? fallback.path : null;
      }
      return { openFiles: remaining, activePath: nextActive };
    });
  },

  setActive(path) {
    if (!get().openFiles.some((f) => f.path === path)) return;
    set({ activePath: path });
  },

  updateContent(path, content) {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path
          ? { ...f, content, dirty: content !== f.baseline }
          : f,
      ),
    }));
  },

  async save(path) {
    const file = get().openFiles.find((f) => f.path === path);
    if (!file) return { ok: false, error: "File not open" };
    const res = await ipc().workspace.writeFile(path, file.content);
    if (!res.ok) return { ok: false, error: res.error };
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, baseline: f.content, dirty: false } : f,
      ),
    }));
    return { ok: true };
  },
}));
