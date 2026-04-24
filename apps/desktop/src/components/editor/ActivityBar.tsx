import { useEditorUI } from "@/store/editor-ui";
import { useScm } from "@/store/scm";
import { Files, Search, GitBranch } from "lucide-react";
import type { SidebarView } from "@/store/editor-ui";
import { cn } from "@/lib/cn";

/**
 * VS Code-style left activity bar — a slim 40px column of view-switcher
 * icons. Clicking the active view icon toggles the sidebar collapsed
 * state, which is the same affordance VS Code ships and what muscle
 * memory expects.
 */
export function ActivityBar() {
  const sidebarView = useEditorUI((s) => s.sidebarView);
  const sidebarCollapsed = useEditorUI((s) => s.sidebarCollapsed);
  const setSidebarView = useEditorUI((s) => s.setSidebarView);
  const toggleSidebar = useEditorUI((s) => s.toggleSidebar);
  const groups = useScm((s) => s.groups);
  const totalChanges =
    groups.staged.length + groups.changes.length + groups.untracked.length;

  const onClick = (view: SidebarView) => {
    if (view === sidebarView && !sidebarCollapsed) {
      toggleSidebar();
    } else {
      setSidebarView(view);
    }
  };

  return (
    <div
      style={{ width: 44 }}
      className="flex h-full flex-col items-center bg-ink-1 border-r border-line shrink-0 select-none"
    >
      <BarBtn
        icon={<Files className="size-[18px]" />}
        label="Files"
        keybinding="⌘⇧E"
        active={!sidebarCollapsed && sidebarView === "files"}
        onClick={() => onClick("files")}
      />
      <BarBtn
        icon={<Search className="size-[18px]" />}
        label="Search"
        keybinding="⌘⇧F"
        active={!sidebarCollapsed && sidebarView === "search"}
        onClick={() => onClick("search")}
      />
      <BarBtn
        icon={<GitBranch className="size-[18px]" />}
        label="Source Control"
        keybinding="⌘⇧G"
        active={!sidebarCollapsed && sidebarView === "scm"}
        onClick={() => onClick("scm")}
        badge={totalChanges > 0 ? totalChanges : undefined}
      />
    </div>
  );
}

function BarBtn({
  icon,
  label,
  keybinding,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  keybinding: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} (${keybinding})`}
      className={cn(
        "press-feedback relative flex h-12 w-full items-center justify-center transition-colors",
        active
          ? "text-text-primary"
          : "text-text-tertiary hover:text-text-secondary",
      )}
    >
      {/* Active indicator: 2px accent strip flush left, like VS Code */}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-accent"
        />
      )}
      {icon}
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute right-1.5 top-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-white text-[9.5px] font-medium tabular-nums flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
