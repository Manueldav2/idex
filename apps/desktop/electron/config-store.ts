import fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_APP_CONFIG, type AppConfig } from "@idex/types";

const CONFIG_DIR = path.join(os.homedir(), ".idex");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function ensureFile() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_APP_CONFIG, null, 2), "utf8");
  }
}

class ConfigStore {
  async read(): Promise<AppConfig> {
    ensureFile();
    try {
      const raw = await fs.readFile(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      // Merge with defaults to handle schema drift
      return { ...DEFAULT_APP_CONFIG, ...parsed, schemaVersion: 1 };
    } catch (e) {
      console.error("[config] failed to read; returning defaults", e);
      return DEFAULT_APP_CONFIG;
    }
  }

  async merge(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.read();
    const next: AppConfig = { ...current, ...patch, schemaVersion: 1 };
    await this.write(next);
    return next;
  }

  private async write(config: AppConfig): Promise<void> {
    ensureDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  }
}

export const configStore = new ConfigStore();
