/**
 * Composio OAuth bridge for the X (Twitter) integration.
 *
 * Connecting an X account requires an interactive consent flow. We:
 *   1. POST /connected_accounts to Composio to initiate a connection,
 *      receiving a `connectedAccountId` and a `redirectUrl`.
 *   2. Open the redirect URL in the user's default browser.
 *   3. Poll the status endpoint until the connection becomes ACTIVE,
 *      fails, expires, or we hit a 5-minute timeout.
 *
 * All Composio fetches run through the shared helpers in `@idex/curator`
 * so the auth flow stays consistent with the runtime search client.
 */
import { shell } from "electron";
import {
  initiateConnection,
  getConnectionStatus,
  type ComposioStatus,
} from "@idex/curator";
import {
  KEYCHAIN_KEY,
  type ComposioConnectXRequest,
  type ComposioConnectXResult,
  type ComposioStatusResult,
} from "@idex/types";
import { keychain } from "./keychain.js";
import { configStore } from "./config-store.js";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Drive the full connect-X flow end to end. Caller awaits the returned
 * promise; resolution means either success (status ACTIVE) or a known
 * terminal failure. The main window is not blocked — this runs on the
 * main process's Node event loop.
 */
export async function connectX(
  req: ComposioConnectXRequest,
): Promise<ComposioConnectXResult> {
  const apiKey = req.apiKey ?? (await keychain.get(KEYCHAIN_KEY.COMPOSIO_API_KEY));
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const authConfigId =
    req.authConfigId ?? (await keychain.get(KEYCHAIN_KEY.COMPOSIO_AUTH_CONFIG_ID));
  if (!authConfigId) {
    return { ok: false, error: "missing_auth_config" };
  }

  let initiated;
  try {
    initiated = await initiateConnection({ apiKey, authConfigId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `initiate_failed: ${msg}` };
  }

  try {
    await shell.openExternal(initiated.redirectUrl);
  } catch (e) {
    // We can still poll — user can paste the URL manually if needed.
    console.warn("[composio] failed to open external URL", e);
  }

  const terminal = await pollUntilTerminal(apiKey, initiated.connectedAccountId);
  if (terminal === "ACTIVE") {
    await configStore.merge({
      composioConnectedAccountId: initiated.connectedAccountId,
    });
    return { ok: true, connectedAccountId: initiated.connectedAccountId };
  }

  if (terminal === "INITIATED") {
    return { ok: false, error: "timeout" };
  }
  return { ok: false, error: terminal.toLowerCase() };
}

async function pollUntilTerminal(
  apiKey: string,
  connectedAccountId: string,
): Promise<ComposioStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getConnectionStatus({ apiKey, connectedAccountId });
    if (status === "ACTIVE" || status === "FAILED" || status === "EXPIRED") {
      return status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return "INITIATED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Lightweight status check — reads config for the stored account id and
 * asks Composio what state it's in. Used by the Settings panel to show a
 * green/yellow/red dot next to the X integration.
 */
export async function readStatus(): Promise<ComposioStatusResult> {
  const config = await configStore.read();
  const connectedAccountId = config.composioConnectedAccountId;
  if (!connectedAccountId) {
    return { ok: true, status: "UNKNOWN", connectedAccountId: null };
  }
  const apiKey = await keychain.get(KEYCHAIN_KEY.COMPOSIO_API_KEY);
  if (!apiKey) {
    return {
      ok: false,
      status: "UNKNOWN",
      connectedAccountId,
      error: "missing_api_key",
    };
  }
  const status = await getConnectionStatus({ apiKey, connectedAccountId });
  return { ok: true, status, connectedAccountId };
}
