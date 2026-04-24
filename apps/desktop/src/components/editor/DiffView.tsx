import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Read-only diff view. We render the unified diff text with line-level
 * coloring (green = +, red = -, gray = context, blue = hunk header).
 * Not a side-by-side diff — VS Code's split view requires either Monaco
 * diff editor or a custom widget; for now this is the GitHub-style
 * inline view that gets the job done at zero monaco-diff complexity.
 *
 * Performance: parses the diff string once into line records on prop
 * change. Long diffs (>10k lines) are clipped — a follow-up could
 * virtualise.
 */
interface Props {
  path: string;
  diff: string;
  loading: boolean;
}

interface DiffLine {
  kind: "context" | "add" | "del" | "hunk" | "meta";
  text: string;
}

export function DiffView({ path, diff, loading }: Props) {
  const lines: DiffLine[] = useMemo(() => parseDiff(diff), [diff]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-ink-0">
      <header className="flex items-center justify-between gap-2 px-4 py-1.5 border-b border-line shrink-0">
        <span className="text-[12px] text-text-secondary font-mono truncate">{path}</span>
        <span className="text-[10.5px] text-text-tertiary">read-only diff</span>
      </header>
      {loading && (
        <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-text-tertiary">
          <Loader2 className="size-3.5 animate-spin" /> Loading diff…
        </div>
      )}
      {!loading && lines.length === 0 && (
        <div className="px-4 py-6 text-[12px] text-text-tertiary text-center">
          No textual changes.
        </div>
      )}
      {!loading && lines.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-[12px] leading-[1.5]">
          {lines.slice(0, 10000).map((l, i) => (
            <div
              key={i}
              className={cn(
                "px-4 whitespace-pre",
                l.kind === "add" && "bg-emerald-500/10 text-emerald-200",
                l.kind === "del" && "bg-red-500/10 text-red-200",
                l.kind === "hunk" && "bg-accent/10 text-accent/80",
                l.kind === "meta" && "text-text-tertiary",
                l.kind === "context" && "text-text-secondary",
              )}
            >
              {l.text || "\u00a0"}
            </div>
          ))}
          {lines.length > 10000 && (
            <div className="px-4 py-2 text-[11px] text-text-tertiary">
              … {lines.length - 10000} more lines truncated.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  const out: DiffLine[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) out.push({ kind: "hunk", text: line });
    else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file"))
      out.push({ kind: "meta", text: line });
    else if (line.startsWith("+")) out.push({ kind: "add", text: line });
    else if (line.startsWith("-")) out.push({ kind: "del", text: line });
    else out.push({ kind: "context", text: line });
  }
  return out;
}
