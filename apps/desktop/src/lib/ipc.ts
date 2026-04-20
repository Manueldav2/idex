import type {
  AgentSpawnOptions,
  AgentInput,
  AgentResize,
  AgentOutputChunk,
  AgentStateEvent,
  AppConfig,
  KeychainKey,
  Session,
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
        spawn: (opts: AgentSpawnOptions) => Promise<{ ok: boolean; error?: string; session?: Session }>;
        input: (input: AgentInput) => Promise<void>;
        resize: (r: AgentResize) => Promise<void>;
        kill: (sessionId: string) => Promise<void>;
        list: () => Promise<Session[]>;
        onOutput: (cb: (chunk: AgentOutputChunk) => void) => () => void;
        onState: (cb: (event: AgentStateEvent) => void) => () => void;
      };
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

export const ipc = () => window.idex;
