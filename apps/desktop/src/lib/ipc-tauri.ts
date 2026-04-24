/*
 * Tauri-flavored IPC bridge — produces the same `window.idex` shape as
 * the Electron preload, but routed through Tauri's `invoke()` and
 * `listen()` instead. The renderer doesn't know or care which backend
 * it's talking to: `lib/ipc.ts` picks the right implementation at
 * runtime based on `__TAURI_INTERNALS__`.
 *
 * Keeping this in pure TypeScript (no Tauri-specific React imports)
 * means we can lazy-import the @tauri-apps/api packages only when
 * we're actually inside a Tauri shell.
 */

import type {
  AgentInput,
  AgentOutputChunk,
  AgentResize,
  AgentSpawnOptions,
  AgentStateEvent,
  AppConfig,
  ExternalAgentLaunchOptions,
  ExternalAgentLaunchResult,
  FileNode,
  KeychainKey,
  ProjectCreateFolderArgs,
  ProjectCreateFolderResult,
  Session,
  WorkspaceOpenResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "@idex/types";

/**
 * Build and install `window.idex` so the rest of the renderer can pretend
 * it's still running under the Electron preload contract. Called once at
 * boot from `lib/ipc.ts` after we've detected we're in Tauri.
 */
export async function installTauriBridge(): Promise<void> {
  // Lazy import so non-Tauri builds don't have to ship the @tauri-apps
  // runtime in their bundle.
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const idex: Window["idex"] = {
    config: {
      get: () => invoke<AppConfig>("get_config"),
      set: (patch: Partial<AppConfig>) => invoke<AppConfig>("set_config", { patch }),
    },
    keychain: {
      get: (key: KeychainKey) => invoke<string | null>("keychain_get", { key }),
      set: (key: KeychainKey, value: string) =>
        invoke<boolean>("keychain_set", { key, value }),
    },
    agent: {
      spawn: (opts: AgentSpawnOptions) =>
        invoke<{ ok: boolean; error?: string; session?: Session }>("agent_spawn", {
          args: opts,
        }),
      input: (input: AgentInput) => invoke<void>("agent_input", { args: input }),
      resize: (r: AgentResize) => invoke<void>("agent_resize", { args: r }),
      kill: (sessionId: string) => invoke<void>("agent_kill", { sessionId }),
      list: () => invoke<Session[]>("agent_list"),
      onOutput(cb) {
        let unsub: (() => void) | null = null;
        void listen<AgentOutputChunk>("agent:output", (event) => cb(event.payload)).then(
          (off) => {
            unsub = off;
          },
        );
        return () => {
          unsub?.();
          unsub = null;
        };
      },
      onState(cb) {
        let unsub: (() => void) | null = null;
        void listen<AgentStateEvent>("agent:state", (event) => cb(event.payload)).then(
          (off) => {
            unsub = off;
          },
        );
        return () => {
          unsub?.();
          unsub = null;
        };
      },
      launchExternal: (opts: ExternalAgentLaunchOptions) =>
        invoke<ExternalAgentLaunchResult>("agent_launch_external", { opts }),
    },
    openExternal: (url: string) => invoke<boolean>("open_external", { url }),
    workspace: {
      open: () => invoke<WorkspaceOpenResult | null>("workspace_open"),
      tree: (rootPath: string) => invoke<FileNode | null>("workspace_tree", { rootPath }),
      readFile: (filePath: string) =>
        invoke<WorkspaceReadFileResult>("workspace_read_file", { filePath }),
      writeFile: (filePath: string, content: string) =>
        invoke<WorkspaceWriteFileResult>("workspace_write_file", {
          filePath,
          content,
        }),
    },
    projects: {
      create: (args: ProjectCreateFolderArgs) =>
        invoke<ProjectCreateFolderResult>("projects_create_folder", { args }),
    },
    // Composio bridge — not yet implemented on the Rust side, so every
    // method resolves to a graceful "not connected" state. The Electron
    // host has the real implementation; Tauri parity is tracked as a
    // follow-up.
    composio: {
      connectX: async () => ({
        ok: false,
        error: "Composio integration is not yet available on the Tauri backend.",
      }),
      status: async () => ({ ok: true, status: "UNKNOWN" as const }),
    },
    search: {
      workspace: (rootPath, opts) =>
        invoke("search_workspace", { rootPath, opts }),
    },
    scm: {
      status: (rootPath) => invoke("scm_status", { rootPath }),
      diff: (rootPath, path, staged = false) =>
        invoke("scm_diff", { rootPath, path, staged }),
      stage: (rootPath, args) => invoke("scm_stage", { rootPath, args }),
      commit: (rootPath, args) => invoke("scm_commit", { rootPath, args }),
      run: (rootPath, cmd) => invoke("scm_run", { rootPath, cmd }),
    },
  };

  (window as Window & typeof globalThis).idex = idex;
}

/**
 * True when the page is being served inside a Tauri webview. Tauri injects
 * `__TAURI_INTERNALS__` (and on older versions `__TAURI__`) before any
 * page script runs, so checking either is reliable.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w["__TAURI_INTERNALS__"] || w["__TAURI__"]);
}
