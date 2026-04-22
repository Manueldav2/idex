/**
 * Opt-in telemetry for curator quality tuning.
 *
 * Payload contract (never violate):
 *   - Never include prompts, code, file paths, or user handles.
 *   - Anonymous only — the `topicHash` is a salted SHA-256 of the
 *     normalised topics string, with no way to reverse it.
 *   - Fire-and-forget with a hard 2s timeout — a failed POST must
 *     never stall the UI or raise.
 *
 * The endpoint is a placeholder until we stand up the telemetry service.
 * When unset, all calls become no-ops so nothing leaves the machine.
 */

const DEFAULT_ENDPOINT = "";
const TIMEOUT_MS = 2_000;

export type TelemetryAction = "shown" | "thumbs_up" | "thumbs_down" | "opened";

export interface TelemetryEvent {
  cardId: string;
  topicHash: string;
  action: TelemetryAction;
  /** Card source label (no user identifiers). */
  source: string;
  /** ms epoch. */
  ts: number;
}

export interface TelemetryOptions {
  endpoint?: string;
  /** If false, every call is a no-op. Defaults to false for safety. */
  enabled?: boolean;
}

/**
 * Hash a topic list to an opaque 16-char digest. Uses SubtleCrypto when
 * available (renderer + modern Node). When unavailable, returns a short
 * stable non-cryptographic hash — sufficient for bucketing, and
 * explicitly not a PII surface.
 */
export async function hashTopics(topics: string[]): Promise<string> {
  const normalized = topics
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  if (!normalized) return "none";

  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode("idex::" + normalized);
    const digest = await subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 16);
  }

  // Fallback: FNV-1a. Never used in the real app — included so this
  // module works in test environments without SubtleCrypto.
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fire a telemetry event. Never throws. No-ops when telemetry is
 * disabled or the endpoint is unset.
 */
export async function sendTelemetry(
  event: TelemetryEvent,
  options: TelemetryOptions = {},
): Promise<void> {
  const { endpoint = DEFAULT_ENDPOINT, enabled = false } = options;
  if (!enabled || !endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      // No credentials, no cookies.
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    // Silent by design — telemetry must never break the app.
  }
}
