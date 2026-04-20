import { create } from "zustand";
import { DEFAULT_APP_CONFIG, type AppConfig } from "@idex/types";
import { ipc } from "@/lib/ipc";

interface SettingsStore {
  config: AppConfig;
  loaded: boolean;
  load: () => Promise<void>;
  patch: (patch: Partial<AppConfig>) => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  config: DEFAULT_APP_CONFIG,
  loaded: false,

  async load() {
    const config = await ipc().config.get();
    set({ config, loaded: true });
  },

  async patch(patch) {
    const next = await ipc().config.set(patch);
    set({ config: next });
  },
}));
