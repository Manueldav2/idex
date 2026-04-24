import { useEffect, useRef, useState } from "react";
import { useSearch } from "@/store/search";
import { useWorkspace } from "@/store/workspace";
import { ChevronDown, ChevronRight, Regex, CaseSensitive, WholeWord, Loader2, Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Workspace search panel — VS Code-style ⌘⇧F.
 *
 * Mirrors VS Code's behavior: query input with toggles for regex /
 * case / whole-word, optional include/exclude globs, file groups
 * collapsible, click a match to open the file at the line, run on
 * 200ms debounce. Backed by ripgrep in the main process.
 */
export function SearchPanel() {
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const isRegex = useSearch((s) => s.isRegex);
  const setIsRegex = useSearch((s) => s.setIsRegex);
  const caseSensitive = useSearch((s) => s.caseSensitive);
  const setCaseSensitive = useSearch((s) => s.setCaseSensitive);
  const wholeWord = useSearch((s) => s.wholeWord);
  const setWholeWord = useSearch((s) => s.setWholeWord);
  const include = useSearch((s) => s.include);
  const setInclude = useSearch((s) => s.setInclude);
  const exclude = useSearch((s) => s.exclude);
  const setExclude = useSearch((s) => s.setExclude);
  const result = useSearch((s) => s.result);
  const loading = useSearch((s) => s.loading);
  const runNow = useSearch((s) => s.runNow);
  const openFile = useWorkspace((s) => s.openFile);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount + when ⌘⇧F is hit while panel is already
  // visible (the keybinding handler refocuses by re-mounting only the
  // panel? No — by setting a ref on store. For simplicity: just focus
  // on mount, the keybinding sets the view which triggers a re-render.)
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-ink-1">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-[0.06em]">
          Search
        </span>
      </header>

      <div className="px-3 py-2.5 space-y-2 border-b border-line">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runNow();
            }}
            placeholder="Search…"
            className="w-full rounded-md bg-ink-2 border border-line pl-7 pr-20 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-tertiary/70 font-mono focus:outline-none focus:border-accent/60 transition-colors"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <ToggleBtn active={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)} title="Match case (Alt+C)">
              <CaseSensitive className="size-3.5" />
            </ToggleBtn>
            <ToggleBtn active={wholeWord} onClick={() => setWholeWord(!wholeWord)} title="Match whole word (Alt+W)">
              <WholeWord className="size-3.5" />
            </ToggleBtn>
            <ToggleBtn active={isRegex} onClick={() => setIsRegex(!isRegex)} title="Use regex (Alt+R)">
              <Regex className="size-3.5" />
            </ToggleBtn>
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="press-feedback flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {showAdvanced ? "Hide filters" : "Show filters"}
        </button>

        {showAdvanced && (
          <div className="space-y-1.5 pt-1">
            <input
              type="text"
              value={include}
              onChange={(e) => setInclude(e.target.value)}
              placeholder="files to include  e.g. **/*.ts, src/**"
              className="w-full rounded bg-ink-2 border border-line px-2 py-1 text-[11.5px] text-text-primary placeholder:text-text-tertiary/70 font-mono focus:outline-none focus:border-accent/60"
            />
            <input
              type="text"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              placeholder="files to exclude  e.g. **/*.test.ts"
              className="w-full rounded bg-ink-2 border border-line px-2 py-1 text-[11.5px] text-text-primary placeholder:text-text-tertiary/70 font-mono focus:outline-none focus:border-accent/60"
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-text-tertiary">
            <Loader2 className="size-3.5 animate-spin" /> Searching…
          </div>
        )}

        {!loading && result && !result.ok && result.error && (
          <div className="px-3 py-3 text-[12px] text-error font-mono leading-relaxed">
            {result.error}
          </div>
        )}

        {!loading && result && result.ok && result.totalMatches === 0 && query.trim().length >= 2 && (
          <div className="px-3 py-3 text-[12px] text-text-tertiary">
            No results for{" "}
            <span className="font-mono text-text-secondary">"{query}"</span>
          </div>
        )}

        {!loading && result && result.ok && result.totalMatches > 0 && (
          <>
            <div className="px-3 py-2 text-[11px] text-text-tertiary border-b border-line">
              {result.totalMatches} {result.totalMatches === 1 ? "result" : "results"} in{" "}
              {result.files.length} {result.files.length === 1 ? "file" : "files"}
              {result.truncated && " · truncated"}
              <span className="ml-1 opacity-60">· {result.elapsedMs}ms</span>
            </div>
            <div>
              {result.files.map((f) => (
                <FileGroup
                  key={f.path}
                  filePath={f.path}
                  matches={f.matches}
                  onOpen={(line) => {
                    // openFile resolves relative paths against the workspace
                    // root. Preserving line context is best-effort: Monaco
                    // will reveal the line via its own goto-line.
                    void openFile(f.path, { revealLine: line });
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "press-feedback inline-flex items-center justify-center size-6 rounded transition-colors",
        active
          ? "bg-accent/15 text-accent"
          : "text-text-tertiary hover:text-text-primary hover:bg-ink-2",
      )}
    >
      {children}
    </button>
  );
}

function FileGroup({
  filePath,
  matches,
  onOpen,
}: {
  filePath: string;
  matches: { line: number; column: number; text: string; matchLength: number }[];
  onOpen: (line: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fileName = filePath.split("/").pop() ?? filePath;
  const dir = filePath.slice(0, filePath.length - fileName.length).replace(/\/$/, "");

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1 px-3 py-1 hover:bg-ink-2/60 transition-colors text-left"
      >
        {collapsed ? (
          <ChevronRight className="size-3 text-text-tertiary shrink-0" />
        ) : (
          <ChevronDown className="size-3 text-text-tertiary shrink-0" />
        )}
        <span className="text-[12px] text-text-primary truncate">{fileName}</span>
        {dir && (
          <span className="text-[11px] text-text-tertiary truncate">{dir}</span>
        )}
        <span className="ml-auto text-[10.5px] text-text-tertiary tabular-nums px-1.5 rounded bg-ink-2/80 shrink-0">
          {matches.length}
        </span>
      </button>
      {!collapsed && (
        <div>
          {matches.map((m, i) => (
            <button
              key={`${m.line}:${m.column}:${i}`}
              onClick={() => onOpen(m.line)}
              className="flex w-full items-baseline gap-2 pl-7 pr-3 py-0.5 hover:bg-ink-2/40 transition-colors text-left"
            >
              <span className="text-[10.5px] text-text-tertiary tabular-nums w-8 shrink-0">
                {m.line}
              </span>
              <MatchLine text={m.text} column={m.column} matchLength={m.matchLength} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchLine({ text, column, matchLength }: { text: string; column: number; matchLength: number }) {
  const before = text.slice(0, column);
  const hit = text.slice(column, column + matchLength);
  const after = text.slice(column + matchLength);
  return (
    <span className="font-mono text-[11.5px] text-text-secondary truncate">
      {before}
      <span className="bg-accent/30 text-text-primary px-0.5 rounded-sm">{hit}</span>
      {after}
    </span>
  );
}
