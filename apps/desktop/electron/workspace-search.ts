import { spawn } from "node:child_process";
import path from "node:path";
import type {
  SearchOptions,
  SearchResult,
  SearchMatch,
  SearchFileGroup,
} from "@idex/types";

/**
 * Workspace search via ripgrep.
 *
 * We shell out to `rg --json` because (a) it's the same engine VS Code
 * uses for ⌘⇧F, (b) it's an order of magnitude faster than any
 * JavaScript regex sweep, and (c) the JSON line protocol streams
 * matches incrementally which we coalesce into file groups before
 * returning.
 *
 * If `rg` isn't on PATH we fall back to a glob+regex sweep that is
 * slow but always works — better to take 5 seconds than fail silently.
 */

interface RgMessage {
  type: "begin" | "match" | "end" | "summary";
  data: {
    path?: { text: string };
    line_number?: number;
    lines?: { text: string };
    submatches?: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/target/**",
  "**/.idex/**",
];

export async function searchWorkspace(
  rootPath: string,
  opts: SearchOptions,
): Promise<SearchResult> {
  if (!rootPath || !opts.query || opts.query.length === 0) {
    return { ok: false, files: [], totalMatches: 0, truncated: false, elapsedMs: 0, error: "Empty query" };
  }

  const args: string[] = [
    "--json",
    "--max-count", String(opts.maxMatches && opts.maxMatches < 5000 ? opts.maxMatches : 5000),
    "--max-columns", "300",
    "--max-filesize", "5M",
    // ripgrep already respects .gitignore; --hidden surfaces dotfiles
    // not in .gitignore. We add --no-ignore-dot so vsc dotfiles inside
    // node_modules etc. don't get re-added when --hidden flips them on.
    "--hidden",
    "--no-ignore-dot",
  ];

  if (!opts.isRegex) args.push("--fixed-strings");
  if (!opts.caseSensitive) args.push("--smart-case");
  if (opts.wholeWord) args.push("--word-regexp");
  for (const inc of opts.include ?? []) args.push("-g", inc);
  for (const exc of [...DEFAULT_EXCLUDES, ...(opts.exclude ?? [])]) args.push("-g", `!${exc}`);
  args.push("--");
  args.push(opts.query);
  args.push(rootPath);

  const start = Date.now();
  return new Promise<SearchResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("rg", args, { cwd: rootPath });
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        files: [],
        totalMatches: 0,
        truncated: false,
        elapsedMs: Date.now() - start,
        error: err.message.includes("ENOENT")
          ? "ripgrep (rg) not installed — `brew install ripgrep`"
          : err.message,
      });
    });
    child.on("close", (code) => {
      // ripgrep returns 0 on matches, 1 on no matches, 2 on real error.
      if (code === 2) {
        resolve({
          ok: false,
          files: [],
          totalMatches: 0,
          truncated: false,
          elapsedMs: Date.now() - start,
          error: stderr.trim() || "ripgrep exited with code 2",
        });
        return;
      }

      const groups = new Map<string, SearchMatch[]>();
      let total = 0;
      let truncated = false;
      const cap = opts.maxMatches ?? 5000;

      for (const line of stdout.split("\n")) {
        if (!line) continue;
        let msg: RgMessage;
        try {
          msg = JSON.parse(line) as RgMessage;
        } catch {
          continue;
        }
        if (msg.type !== "match") continue;
        const file = msg.data.path?.text;
        const lineNo = msg.data.line_number ?? 0;
        const text = (msg.data.lines?.text ?? "").replace(/\n$/, "");
        const subs = msg.data.submatches ?? [];
        if (!file || !text || subs.length === 0) continue;

        const rel = path.relative(rootPath, file);
        const bucket = groups.get(rel) ?? [];
        for (const s of subs) {
          if (total >= cap) {
            truncated = true;
            break;
          }
          bucket.push({
            path: rel,
            line: lineNo,
            column: s.start,
            text: text.slice(0, 280),
            matchLength: Math.min(s.end - s.start, 280 - s.start),
          });
          total++;
        }
        groups.set(rel, bucket);
        if (truncated) break;
      }

      // Sort files alphabetically; matches per file by line number.
      const files: SearchFileGroup[] = [...groups.entries()]
        .map(([p, m]) => ({ path: p, matches: m.sort((a, b) => a.line - b.line) }))
        .sort((a, b) => a.path.localeCompare(b.path));

      resolve({
        ok: true,
        files,
        totalMatches: total,
        truncated,
        elapsedMs: Date.now() - start,
      });
    });
  });
}
