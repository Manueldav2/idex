import type {
  AgentSpawnOptions,
  AgentInput,
  AgentResize,
  AgentOutputChunk,
  AgentStateEvent,
  AppConfig,
  ExternalAgentLaunchOptions,
  ExternalAgentLaunchResult,
  ComposioConnectXRequest,
  ComposioConnectXResult,
  ComposioStatusResult,
  SearchOptions,
  SearchResult,
  GitStatusResult,
  GitDiffResult,
  GitStageArgs,
  GitCommitArgs,
  GitCommitResult,
  GitRunCommand,
  GitRunResult,
  FileNode,
  KeychainKey,
  ProjectCreateFolderArgs,
  ProjectCreateFolderResult,
  Session,
  WorkspaceOpenResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
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
        launchExternal: (opts: ExternalAgentLaunchOptions) => Promise<ExternalAgentLaunchResult>;
      };
      openExternal: (url: string) => Promise<boolean>;
      workspace: {
        open: () => Promise<WorkspaceOpenResult | null>;
        tree: (rootPath: string) => Promise<FileNode | null>;
        readFile: (filePath: string) => Promise<WorkspaceReadFileResult>;
        writeFile: (filePath: string, content: string) => Promise<WorkspaceWriteFileResult>;
      };
      projects: {
        create: (args: ProjectCreateFolderArgs) => Promise<ProjectCreateFolderResult>;
      };
      composio: {
        connectX: (req?: ComposioConnectXRequest) => Promise<ComposioConnectXResult>;
        status: () => Promise<ComposioStatusResult>;
      };
      search: {
        workspace: (rootPath: string, opts: SearchOptions) => Promise<SearchResult>;
      };
      scm: {
        status: (rootPath: string) => Promise<GitStatusResult>;
        diff: (rootPath: string, path: string, staged?: boolean) => Promise<GitDiffResult>;
        stage: (rootPath: string, args: GitStageArgs) => Promise<{ ok: boolean; error?: string }>;
        commit: (rootPath: string, args: GitCommitArgs) => Promise<GitCommitResult>;
        run: (rootPath: string, cmd: GitRunCommand) => Promise<GitRunResult>;
      };
    };
  }
}

export const ipc = () => window.idex;
