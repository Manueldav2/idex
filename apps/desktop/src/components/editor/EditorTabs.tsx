import { useWorkspace } from "@/store/workspace";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

function basename(p: string): string {
  const norm = p.replace(/\\+/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function EditorTabs() {
  const openFiles = useWorkspace((s) => s.openFiles);
  const activePath = useWorkspace((s) => s.activePath);
  const setActive = useWorkspace((s) => s.setActive);
  const closeFile = useWorkspace((s) => s.closeFile);

  if (openFiles.length === 0) return null;

  return (
    <div className="flex items-center border-b border-line bg-ink-1 shrink-0 overflow-x-auto">
      {openFiles.map((f) => {
        const active = f.path === activePath;
        return (
          <div
            key={f.path}
            onClick={() => setActive(f.path)}
            title={f.path}
            className={cn(
              "group relative flex items-center gap-2 px-3 py-1.5 text-[12px] font-mono cursor-pointer shrink-0 border-r border-line transition-colors",
              active
                ? "bg-ink-0 text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-ink-2/60",
            )}
          >
            <span className="truncate max-w-[200px]">{basename(f.path)}</span>
            {f.dirty ? (
              <span
                className="size-1.5 rounded-full bg-accent shrink-0"
                title="Unsaved changes"
              />
            ) : (
              <span className="size-1.5 rounded-full bg-transparent shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(f.path);
              }}
              className="opacity-0 group-hover:opacity-100 hover:bg-ink-1 rounded p-0.5 transition-opacity"
              title="Close file"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
