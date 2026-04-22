import { create } from "zustand";

/**
 * Ephemeral editor-UI state that doesn't need to survive across launches.
 * Right now this just tracks the integrated-terminal panel visibility;
 * over time it'll also cover split direction, terminal height persistence,
 * and breadcrumb pinning.
 */
interface EditorUIStore {
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
}

export const useEditorUI = create<EditorUIStore>((set, get) => ({
  terminalOpen: false,
  setTerminalOpen(open) {
    set({ terminalOpen: open });
  },
  toggleTerminal() {
    set({ terminalOpen: !get().terminalOpen });
  },
}));
