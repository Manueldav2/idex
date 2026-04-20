/**
 * @idex/types — shared type definitions across the IDEX monorepo.
 *
 * This package is the contract between:
 *   - apps/desktop/electron (Electron main process)
 *   - apps/desktop/src (React renderer)
 *   - packages/adapters (per-CLI agent adapters)
 *   - packages/curator (Curator pipeline)
 */

export type AgentId = "claude-code" | "codex" | "freebuff";

export type AgentState = "idle" | "spawning" | "generating" | "done" | "error";

export interface AgentSpawnOptions {
  /** If provided, spawn with this session id. Otherwise main generates one. */
  sessionId?: string;
  agentId: AgentId;
  cwd: string;
  /** Environment variables to forward to the agent process. */
  env?: Record<string, string>;
  /** Optional display label for the session tab. */
  label?: string;
}

export interface Session {
  id: string;
  agentId: AgentId;
  cwd: string;
  label: string;
  state: AgentState;
  createdAt: number;
}

export interface AgentInput {
  sessionId: string;
  text: string;
}

export interface AgentResize {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface AgentOutputChunk {
  sessionId: string;
  /** Raw output chunk including ANSI escapes. */
  raw: string;
  /** Cleaned text — ANSI stripped, normalized line endings. */
  clean: string;
  ts: number;
}

export interface AgentStateEvent {
  sessionId: string;
  state: AgentState;
}

export type ContextEvent =
  | { kind: "user_input"; text: string; ts: number }
  | { kind: "agent_chunk"; text: string; ts: number }
  | { kind: "agent_done"; text: string; ts: number }
  | { kind: "agent_error"; error: string; ts: number };

/**
 * IPC channel names. Keep these as a single source of truth
 * for both main and renderer.
 */
export const IPC = {
  AGENT_SPAWN: "agent:spawn",
  AGENT_INPUT: "agent:input",
  AGENT_OUTPUT_STREAM: "agent:output:stream",
  AGENT_STATE: "agent:state",
  AGENT_KILL: "agent:kill",
  AGENT_RESIZE: "agent:resize",
  SESSION_LIST: "session:list",
  CONTEXT_EVENT: "context:event",
  FEED_CARDS: "feed:cards",
  FEED_STATE: "feed:state",
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  KEYCHAIN_GET: "keychain:get",
  KEYCHAIN_SET: "keychain:set",
  OPEN_EXTERNAL: "open:external",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/* ────────────────────────────────────────────────────────────── *
 * Card data model (Phase 2 lights up; defined here for sharing). *
 * ────────────────────────────────────────────────────────────── */

export interface CardMedia {
  kind: "image" | "video";
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface CardAuthor {
  name: string;
  handle: string;
  avatarUrl?: string;
}

export interface OEmbedPayload {
  html: string;
  width?: number;
  height?: number;
}

export interface CardFallback {
  text: string;
  media?: CardMedia[];
  author: CardAuthor;
  /** ISO 8601 */
  createdAt: string;
}

export interface Card {
  id: string;
  source: "twitter" | "starter" | "ad";
  url: string;
  oembed: OEmbedPayload | null;
  fallback?: CardFallback;
  /** 1-line "Why you're seeing this" string from curator. */
  relevanceReason: string;
  /** 0..1 ranking signal. */
  score: number;
  /** ms epoch */
  fetchedAt: number;
  isAd?: boolean;
}

/* ────────────────────────────────────────── *
 * Feed pane state                            *
 * ────────────────────────────────────────── */

export type FeedState = "peek" | "expanded" | "transitioning";

export interface FeedCardsPayload {
  cards: Card[];
  /** Increment this each time the curator pushes a fresh batch. */
  generation: number;
}

/* ────────────────────────────────────────── *
 * Persistent app config (~/.idex/config.json) *
 * ────────────────────────────────────────── */

export interface AppConfig {
  schemaVersion: 1;
  selectedAgent: AgentId;
  /** If null, auto-detect on PATH. */
  agentBinaryPath: string | null;
  feedEnabled: boolean;
  /** Interval in seconds for auto-scroll while feed is expanded. */
  autoscrollSeconds: number;
  /** Composio account id (non-secret reference) — null until connected. */
  composioConnectedAccountId: string | null;
  /** Has the user agreed to send prompts to OpenRouter + Composio? */
  privacyDisclosureAccepted: boolean;
  /** Master kill-switch for curator (privacy panic mode). */
  curatorEnabled: boolean;
  /** Show ads (v1.0 default OFF, v1.1 default ON). */
  adsEnabled: boolean;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 1,
  selectedAgent: "claude-code",
  agentBinaryPath: null,
  feedEnabled: true,
  autoscrollSeconds: 4,
  composioConnectedAccountId: null,
  privacyDisclosureAccepted: false,
  curatorEnabled: true,
  adsEnabled: false,
};

/* ────────────────────────────────────────── *
 * Keychain key namespacing                   *
 * ────────────────────────────────────────── */

export const KEYCHAIN_SERVICE = "com.devvcore.idex" as const;

export const KEYCHAIN_KEY = {
  COMPOSIO_API_KEY: "composio-api-key",
  OPENROUTER_API_KEY: "openrouter-api-key",
} as const;

export type KeychainKey = (typeof KEYCHAIN_KEY)[keyof typeof KEYCHAIN_KEY];

/* ────────────────────────────────────────── *
 * Agent adapter contract                     *
 * ────────────────────────────────────────── */

export interface AdapterDetectionResult {
  /** True if a user-prompt boundary just occurred in the buffered stream. */
  userPromptBoundary: boolean;
  /** True if the agent appears done generating. */
  agentDoneBoundary: boolean;
  /** Cleaned text emitted in this chunk (ANSI-stripped). */
  cleanText: string;
}

export interface AgentAdapter {
  readonly id: AgentId;
  /**
   * Detect prompt/done boundaries from a buffered raw stream chunk.
   * Implementations should be stateless across calls — the host owns the buffer.
   */
  detect(input: { rawChunk: string; bufferedSinceLastBoundary: string; ts: number }): AdapterDetectionResult;
  /** Default invocation command if no override is set in config. */
  getCommand(): { cmd: string; args: string[] };
  /** Friendly display name for UI. */
  readonly displayName: string;
}
