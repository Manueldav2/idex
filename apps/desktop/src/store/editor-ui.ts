import { create } from "zustand";

/**
 * Which view is mounted in the editor's left sidebar. Mirrors VS Code's
 * activity-bar model: at any moment exactly one of Files / Search /
 * Source Control occupies the sidebar slot. Switching views via ⌘B
 * (toggle), ⌘⇧F (search), ⌘⇧G (scm), ⌘⇧E (files) — the same
 * keybindings VS Code ships.
 */
export type SidebarView = "files" | "search" | "scm";

/**
 * Ephemeral editor-UI state that doesn't need to survive across launches.
 * Tracks the integrated-terminal panel visibility, which sidebar view is
 * active, and whether the sidebar is collapsed.
 */
interface EditorUIStore {
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;

  sidebarView: SidebarView;
  sidebarCollapsed: boolean;
  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useEditorUI = create<EditorUIStore>((set, get) => ({
  terminalOpen: false,
  setTerminalOpen(open) {
    set({ terminalOpen: open });
  },
  toggleTerminal() {
    set({ terminalOpen: !get().terminalOpen });
  },

  sidebarView: "files",
  sidebarCollapsed: false,
  setSidebarView(view) {
    // Switching to a view always uncollapses — opens the sidebar if it
    // was hidden, same as VS Code.
    set({ sidebarView: view, sidebarCollapsed: false });
  },
  toggleSidebar() {
    set({ sidebarCollapsed: !get().sidebarCollapsed });
  },
  setSidebarCollapsed(collapsed) {
    set({ sidebarCollapsed: collapsed });
  },
}));
