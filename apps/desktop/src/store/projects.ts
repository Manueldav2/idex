import { create } from "zustand";
import { RECENT_PROJECTS_MAX, type RecentProject } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useSettings } from "./settings";
import { useWorkspace } from "./workspace";

function normalizeLabel(explicit: string | undefined): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  return undefined; // UI will fall back to basename(path)
}

interface ProjectsStore {
  /** Hydrated from AppConfig on first access; mirrors config.recentProjects. */
  recents: RecentProject[];
  /** Currently active project path (mirrors config.workspacePath). */
  activePath: string | null;

  /** Copy the current config snapshot into the store. */
  hydrateFromConfig: () => void;

  /**
   * Open a project folder. Loads the workspace tree, persists the path as
   * the active workspace, and bumps it to the top of recents.
   */
  openProject: (path: string, label?: string) => Promise<void>;

  /**
   * Ask main to create a folder at `parentDir/name`, then open it.
   * Returns the created folder's absolute path on success.
   */
  createProject: (input: { parentDir: string; name: string }) => Promise<{ ok: boolean; error?: string; path?: string }>;

  /** Drop a single project from the recents list (persisted). */
  removeFromRecents: (path: string) => Promise<void>;
}

/**
 * Upsert `path` as the most-recent entry, drop oldest over the cap.
 * Keeps the existing label if the caller didn't pass one.
 */
function bumpRecents(
  current: RecentProject[],
  path: string,
  label: string | undefined,
  now: number,
): RecentProject[] {
  const existing = current.find((p) => p.path === path);
  const preservedLabel = label ?? existing?.label;
  const next: RecentProject = {
    path,
    lastOpened: now,
    ...(preservedLabel ? { label: preservedLabel } : {}),
  };
  const rest = current.filter((p) => p.path !== path);
  return [next, ...rest].slice(0, RECENT_PROJECTS_MAX);
}

export const useProjects = create<ProjectsStore>((set, get) => ({
  recents: [],
  activePath: null,

  hydrateFromConfig() {
    const { config } = useSettings.getState();
    set({
      recents: config.recentProjects ?? [],
      activePath: config.workspacePath,
    });
  },

  async openProject(path, label) {
    if (!path) return;
    const now = Date.now();
    const nextRecents = bumpRecents(get().recents, path, normalizeLabel(label), now);
    set({ recents: nextRecents, activePath: path });

    // Persist both the active workspace and the bumped recents in one merge.
    await useSettings.getState().patch({
      workspacePath: path,
      recentProjects: nextRecents,
    });

    // Load the tree into the workspace store so FileTree lights up.
    await useWorkspace.getState().loadWorkspace(path);
  },

  async createProject({ parentDir, name }) {
    const result = await ipc().projects.create({ parentDir, name });
    if (!result.ok || !result.path) {
      return { ok: false, error: result.error ?? "Could not create folder" };
    }
    await get().openProject(result.path, name);
    return { ok: true, path: result.path };
  },

  async removeFromRecents(path) {
    const nextRecents = get().recents.filter((p) => p.path !== path);
    set({ recents: nextRecents });
    await useSettings.getState().patch({ recentProjects: nextRecents });
  },
}));

/**
 * Subscribe the projects store to settings changes so external config
 * mutations (e.g. the first config load at boot) are reflected immediately.
 * We set this up lazily on first import to keep the store file side-effect-light.
 */
let _settingsSubscribed = false;
export function wireProjectsToSettings() {
  if (_settingsSubscribed) return;
  _settingsSubscribed = true;
  useProjects.getState().hydrateFromConfig();
  useSettings.subscribe((state, prev) => {
    if (
      state.config.recentProjects === prev.config.recentProjects &&
      state.config.workspacePath === prev.config.workspacePath
    ) {
      return;
    }
    useProjects.setState({
      recents: state.config.recentProjects ?? [],
      activePath: state.config.workspacePath,
    });
  });
}
