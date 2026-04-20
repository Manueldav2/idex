/**
 * Tiny convenience layer over `window.idex` set up by the preload script.
 * Centralizes typing so components don't reach into globals.
 */
import type {
  AgentSpawnOptions,
  AgentInput,
  AppConfig,
  KeychainKey,
} from "@idex/types";

declare global {
  interface Window {
    idex: {
      config: {
        get: () => Promise<AppConfig>;
        set: (patch: Partial<AppConfig>) => Promise<AppConfig>;
      };
      keychain: {
        get: (key: KeychainKey) => Promise<string | null>;
        set: (key: KeychainKey, value: string) => Promise<boolean>;
      };
      agent: {
        spawn: (opts: AgentSpawnOptions) => Promise<{ ok: boolean; error?: string }>;
        input: (input: AgentInput) => Promise<void>;
        kill: () => Promise<void>;
        onOutput: (cb: (chunk: { raw: string; clean: string; ts: number }) => void) => () => void;
        onState: (cb: (state: string) => void) => () => void;
      };
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

export const ipc = () => window.idex;
