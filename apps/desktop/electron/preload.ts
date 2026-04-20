import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@idex/types";
import type {
  AgentSpawnOptions,
  AgentInput,
  AppConfig,
  KeychainKey,
} from "@idex/types";

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.CONFIG_SET, patch),
  },
  keychain: {
    get: (key: KeychainKey): Promise<string | null> =>
      ipcRenderer.invoke(IPC.KEYCHAIN_GET, key),
    set: (key: KeychainKey, value: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.KEYCHAIN_SET, key, value),
  },
  agent: {
    spawn: (opts: AgentSpawnOptions): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.AGENT_SPAWN, opts),
    input: (input: AgentInput): Promise<void> =>
      ipcRenderer.invoke(IPC.AGENT_INPUT, input),
    kill: (): Promise<void> => ipcRenderer.invoke(IPC.AGENT_KILL),
    onOutput: (cb: (chunk: { raw: string; clean: string; ts: number }) => void) => {
      const handler = (_: unknown, chunk: { raw: string; clean: string; ts: number }) =>
        cb(chunk);
      ipcRenderer.on(IPC.AGENT_OUTPUT_STREAM, handler);
      return () => ipcRenderer.off(IPC.AGENT_OUTPUT_STREAM, handler);
    },
    onState: (cb: (state: string) => void) => {
      const handler = (_: unknown, state: string) => cb(state);
      ipcRenderer.on(IPC.AGENT_STATE, handler);
      return () => ipcRenderer.off(IPC.AGENT_STATE, handler);
    },
  },
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
};

contextBridge.exposeInMainWorld("idex", api);

declare global {
  interface Window {
    idex: typeof api;
  }
}
