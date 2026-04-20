import { KEYCHAIN_SERVICE, type KeychainKey } from "@idex/types";

/**
 * Thin wrapper around `keytar` so we can fall back to an in-memory
 * map if keytar fails to load (e.g. during early dev on a system
 * without libsecret-1 on Linux). Production macOS builds always
 * have a working Keychain.
 */
type Keytar = typeof import("keytar");

let keytar: Keytar | null = null;
const memoryFallback = new Map<KeychainKey, string>();

async function loadKeytar(): Promise<Keytar | null> {
  if (keytar) return keytar;
  try {
    const mod = (await import("keytar")) as unknown as { default?: Keytar } & Keytar;
    keytar = (mod.default ?? mod) as Keytar;
    return keytar;
  } catch (e) {
    console.warn("[keychain] keytar unavailable, falling back to memory", e);
    return null;
  }
}

export const keychain = {
  async get(key: KeychainKey): Promise<string | null> {
    const k = await loadKeytar();
    if (!k) return memoryFallback.get(key) ?? null;
    try {
      return await k.getPassword(KEYCHAIN_SERVICE, key);
    } catch (e) {
      console.error("[keychain] get failed", e);
      return null;
    }
  },
  async set(key: KeychainKey, value: string): Promise<boolean> {
    const k = await loadKeytar();
    if (!k) {
      memoryFallback.set(key, value);
      return true;
    }
    try {
      await k.setPassword(KEYCHAIN_SERVICE, key, value);
      return true;
    } catch (e) {
      console.error("[keychain] set failed", e);
      memoryFallback.set(key, value);
      return false;
    }
  },
};
