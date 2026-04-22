import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@idex/types";
import type {
  AgentSpawnOptions,
  AgentInput,
  AgentResize,
  AgentOutputChunk,
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

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_SET, patch),
  },
  keychain: {
    get: (key: KeychainKey): Promise<string | null> => ipcRenderer.invoke(IPC.KEYCHAIN_GET, key),
    set: (key: KeychainKey, value: string): Promise<boolean> => ipcRenderer.invoke(IPC.KEYCHAIN_SET, key, value),
  },
  agent: {
    spawn: (opts: AgentSpawnOptions): Promise<{ ok: boolean; error?: string; session?: Session }> =>
      ipcRenderer.invoke(IPC.AGENT_SPAWN, opts),
    input: (input: AgentInput): Promise<void> => ipcRenderer.invoke(IPC.AGENT_INPUT, input),
    resize: (r: AgentResize): Promise<void> => ipcRenderer.invoke(IPC.AGENT_RESIZE, r),
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.AGENT_KILL, sessionId),
    list: (): Promise<Session[]> => ipcRenderer.invoke(IPC.SESSION_LIST),
    onOutput: (cb: (chunk: AgentOutputChunk) => void) => {
      const handler = (_: unknown, chunk: AgentOutputChunk) => cb(chunk);
      ipcRenderer.on(IPC.AGENT_OUTPUT_STREAM, handler);
      return () => ipcRenderer.off(IPC.AGENT_OUTPUT_STREAM, handler);
    },
    onState: (cb: (event: AgentStateEvent) => void) => {
      const handler = (_: unknown, event: AgentStateEvent) => cb(event);
      ipcRenderer.on(IPC.AGENT_STATE, handler);
      return () => ipcRenderer.off(IPC.AGENT_STATE, handler);
    },
    launchExternal: (opts: ExternalAgentLaunchOptions): Promise<ExternalAgentLaunchResult> =>
      ipcRenderer.invoke(IPC.AGENT_LAUNCH_EXTERNAL, opts),
  },
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  workspace: {
    open: (): Promise<WorkspaceOpenResult | null> => ipcRenderer.invoke(IPC.WORKSPACE_OPEN),
    tree: (rootPath: string): Promise<FileNode | null> => ipcRenderer.invoke(IPC.WORKSPACE_TREE, rootPath),
    readFile: (filePath: string): Promise<WorkspaceReadFileResult> =>
      ipcRenderer.invoke(IPC.WORKSPACE_READ_FILE, filePath),
    writeFile: (filePath: string, content: string): Promise<WorkspaceWriteFileResult> =>
      ipcRenderer.invoke(IPC.WORKSPACE_WRITE_FILE, filePath, content),
  },
  projects: {
    create: (args: ProjectCreateFolderArgs): Promise<ProjectCreateFolderResult> =>
      ipcRenderer.invoke(IPC.PROJECTS_CREATE_FOLDER, args),
  },
};

contextBridge.exposeInMainWorld("idex", api);

declare global {
  interface Window {
    idex: typeof api;
  }
}
