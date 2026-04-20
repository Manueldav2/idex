import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Folder, FolderOpen, FolderPlus, Sparkles, X } from "lucide-react";
import { useProjects } from "@/store/projects";
import { useWorkspace } from "@/store/workspace";
import type { RecentProject } from "@idex/types";
import { cn } from "@/lib/cn";

/**
 * First-launch + menu-invoked launcher. Shows the user's recents in a
 * scannable grid and offers two primary actions:
 *   1. Open folder — reuses the existing OS picker via window.idex.workspace.open
 *   2. New project — picks a parent dir via the OS picker, then prompts for a
 *      folder name and creates it through the new projects:create-folder IPC.
 *
 * Visual language follows the cockpit's dark-glass aesthetic: ink-1 panel,
 * line borders, mono accents, press-feedback on interactive elements.
 */
interface Props {
  /** Optional: render inline (no fullscreen backdrop) when embedded in Cockpit. */
  variant?: "fullscreen" | "modal";
  /** Called after the user successfully opens or creates a project. */
  onProjectOpened?: () => void;
  /** Called when the user explicitly dismisses (modal variant only). */
  onDismiss?: () => void;
}

export function ProjectsLauncher({
  variant = "fullscreen",
  onProjectOpened,
  onDismiss,
}: Props) {
  const recents = useProjects((s) => s.recents);
  const openProject = useProjects((s) => s.openProject);
  const removeFromRecents = useProjects((s) => s.removeFromRecents);
  const createProject = useProjects((s) => s.createProject);
  const openWorkspacePicker = useWorkspace((s) => s.openWorkspace);
  const [newOpen, setNewOpen] = useState(false);

  const handleOpenFolder = async () => {
    await openWorkspacePicker();
    onProjectOpened?.();
  };

  const handleRecent = async (p: RecentProject) => {
    await openProject(p.path, p.label);
    onProjectOpened?.();
  };

  const body = (
    <div
      className={cn(
        "w-full flex flex-col gap-6 text-text-primary",
        variant === "fullscreen" ? "max-w-3xl" : "max-w-2xl",
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-text-secondary">
            <Sparkles className="size-3 text-accent" /> projects
          </div>
          <h1 className="mt-1 font-display font-semibold text-text-primary text-3xl leading-[1.05] tracking-tight">
            Pick up where you left off.
          </h1>
          <p className="mt-2 text-sm text-text-secondary max-w-md leading-relaxed">
            Open a folder to give your agent a workspace. Recents live here
            until you clear them.
          </p>
        </div>
        {variant === "modal" && onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile
          icon={<FolderOpen className="size-5" />}
          title="Open folder"
          sub="Pick any directory on disk"
          onClick={() => void handleOpenFolder()}
        />
        <ActionTile
          icon={<FolderPlus className="size-5" />}
          title="New project"
          sub="Create an empty folder"
          onClick={() => setNewOpen(true)}
          accent
        />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-text-secondary">
            recent
          </h2>
          {recents.length > 0 && (
            <span className="text-[10px] font-mono text-text-secondary/60">
              {recents.length}/{10}
            </span>
          )}
        </div>

        {recents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-ink-1/50 p-6 text-center">
            <p className="text-[12px] font-mono text-text-secondary">
              No recents yet — open a folder to start one.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recents.map((p) => (
              <RecentRow
                key={p.path}
                project={p}
                onOpen={() => void handleRecent(p)}
                onRemove={() => void removeFromRecents(p.path)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const inner = (
    <>
      {body}
      <AnimatePresence>
        {newOpen && (
          <NewProjectDialog
            onCancel={() => setNewOpen(false)}
            onCreate={async ({ parentDir, name }) => {
              const result = await createProject({ parentDir, name });
              if (result.ok) {
                setNewOpen(false);
                onProjectOpened?.();
              }
              return result;
            }}
          />
        )}
      </AnimatePresence>
    </>
  );

  if (variant === "modal") {
    return <div className="w-full">{inner}</div>;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-0 px-12 py-16 overflow-y-auto draggable">
      <div className="no-drag w-full flex justify-center">{inner}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── *
 * Sub-components                                                 *
 * ────────────────────────────────────────────────────────────── */

function ActionTile({
  icon,
  title,
  sub,
  onClick,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "press-feedback group text-left rounded-xl border bg-ink-1 p-4 transition-colors",
        "hover:bg-ink-2 focus:outline-none focus:ring-2 focus:ring-accent-soft",
        accent ? "border-accent/40 hover:border-accent" : "border-line",
      )}
    >
      <div
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
          accent
            ? "bg-accent-soft text-accent"
            : "bg-ink-2 text-text-secondary group-hover:text-text-primary",
        )}
      >
        {icon}
      </div>
      <div className="mt-3 font-display font-semibold text-[15px] tracking-tight">{title}</div>
      <div className="mt-0.5 text-[12px] font-mono text-text-secondary">{sub}</div>
    </button>
  );
}

function RecentRow({
  project,
  onOpen,
  onRemove,
}: {
  project: RecentProject;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const label = project.label ?? basename(project.path);
  const relative = useMemo(() => formatRelative(project.lastOpened), [project.lastOpened]);
  return (
    <li className="group flex items-center gap-2">
      <button
        onClick={onOpen}
        className="press-feedback flex-1 min-w-0 flex items-center gap-3 rounded-lg border border-line bg-ink-1 px-3 py-2 text-left transition-colors hover:bg-ink-2 hover:border-line/80"
        title={project.path}
      >
        <Folder className="size-4 text-text-secondary shrink-0 group-hover:text-accent transition-colors" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-primary truncate">{label}</div>
          <div className="text-[11px] font-mono text-text-secondary truncate">{project.path}</div>
        </div>
        <div className="text-[10px] font-mono text-text-secondary/70 shrink-0">{relative}</div>
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove from recents"
        className="press-feedback p-1.5 rounded-md text-text-secondary/50 hover:text-error hover:bg-ink-2 transition-colors opacity-0 group-hover:opacity-100"
        title="Remove from recents"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function NewProjectDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (args: { parentDir: string; name: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickParent = async () => {
    const result = await window.idex.workspace.open();
    if (result?.path) setParentDir(result.path);
  };

  const submit = async () => {
    if (!parentDir) {
      setError("Pick a parent directory first.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a folder name.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await onCreate({ parentDir, name: name.trim() });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Could not create folder");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm px-6"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-ink-1 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-text-primary">
            New project
          </h3>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="press-feedback p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-[12px] font-mono text-text-secondary">
          Pick where it lives, then name it.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-secondary">
              parent directory
            </label>
            <div className="mt-1 flex items-center gap-2">
              <div
                className={cn(
                  "flex-1 min-w-0 rounded-md border border-line bg-ink-0 px-2.5 py-1.5 text-[12px] font-mono truncate",
                  parentDir ? "text-text-primary" : "text-text-secondary/60",
                )}
                title={parentDir ?? undefined}
              >
                {parentDir ?? "— no folder picked —"}
              </div>
              <button
                onClick={() => void pickParent()}
                className="press-feedback shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-mono bg-ink-2 border border-line text-text-primary hover:border-accent hover:text-accent transition-colors"
              >
                <FolderOpen className="size-3.5" /> pick
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-secondary">
              folder name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="my-new-idea"
              className="mt-1 w-full rounded-md border border-line bg-ink-0 px-2.5 py-1.5 text-[13px] font-mono text-text-primary placeholder:text-text-secondary/40 outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <div className="text-[11px] font-mono text-error leading-relaxed">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              className="press-feedback px-3 py-1.5 rounded-md text-[12px] font-mono text-text-secondary hover:text-text-primary transition-colors"
            >
              cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy || !parentDir || !name.trim()}
              className="press-feedback inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-mono bg-accent text-white hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none transition-[filter,opacity]"
            >
              {busy ? "creating…" : "create"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────── *
 * helpers                                                        *
 * ────────────────────────────────────────────────────────────── */

function basename(p: string): string {
  const norm = p.replace(/\\+/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function formatRelative(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
