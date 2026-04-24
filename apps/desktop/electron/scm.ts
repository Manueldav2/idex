import { spawn } from "node:child_process";
import path from "node:path";
import type {
  GitStatusResult,
  GitFileStatus,
  GitDiffResult,
  GitStageArgs,
  GitCommitArgs,
  GitCommitResult,
  GitRunCommand,
  GitRunResult,
} from "@idex/types";

/**
 * Source-control bridge.
 *
 * Shells out to `git` rather than embedding `simple-git` because (a)
 * git is universally installed, (b) we get exact CLI semantics, (c) we
 * avoid bundling another 3MB of node-modules. Every call uses
 * `--no-pager` to stop git from spawning `less` and hanging us.
 *
 * Path safety: every path argument coming from the renderer is
 * resolved against the workspace root and refused if it escapes.
 */

interface RunOpts {
  cwd: string;
  /** Args after `git`. Do NOT include `git` itself. */
  args: string[];
  /** stdin to pipe in (used for commit message). */
  stdin?: string;
  /** Cap how long the command can run. */
  timeoutMs?: number;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(opts: RunOpts): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["--no-pager", ...opts.args], { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const t = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGTERM");
        }, opts.timeoutMs)
      : null;
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", () => {
      if (t) clearTimeout(t);
      resolve({ code: -1, stdout, stderr: stderr || "git not installed" });
    });
    child.on("close", (code) => {
      if (t) clearTimeout(t);
      if (killed) {
        resolve({ code: -1, stdout, stderr: stderr + "\n(git command timed out)" });
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (opts.stdin && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}

/**
 * Resolve a workspace-relative path safely. Refuses absolute paths and
 * any traversal that escapes the root.
 */
function safeRelative(rootPath: string, rel: string): string | null {
  if (path.isAbsolute(rel)) return null;
  const abs = path.resolve(rootPath, rel);
  if (!abs.startsWith(rootPath + path.sep) && abs !== rootPath) return null;
  return path.relative(rootPath, abs);
}

export async function gitStatus(rootPath: string): Promise<GitStatusResult> {
  if (!rootPath) {
    return { ok: false, branch: null, ahead: 0, behind: 0, files: [], error: "No workspace open" };
  }

  // Verify we're inside a git repo.
  const inside = await runGit({
    cwd: rootPath,
    args: ["rev-parse", "--is-inside-work-tree"],
    timeoutMs: 3000,
  });
  if (inside.code !== 0) {
    return {
      ok: false,
      branch: null,
      ahead: 0,
      behind: 0,
      files: [],
      error: "Not a git repository",
    };
  }

  // Branch + ahead/behind in one porcelain v2 call.
  const status = await runGit({
    cwd: rootPath,
    args: ["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
    timeoutMs: 5000,
  });
  if (status.code !== 0) {
    return {
      ok: false,
      branch: null,
      ahead: 0,
      behind: 0,
      files: [],
      error: status.stderr.trim() || "git status failed",
    };
  }

  return parseStatus(status.stdout);
}

/**
 * Parse git's porcelain v2 output. Each line:
 *   `# branch.head <name>`
 *   `# branch.ab +<ahead> -<behind>`
 *   `1 XY ... <path>`               — tracked changed file
 *   `2 XY ... <orig> <path>`        — renamed/copied file
 *   `? <path>`                      — untracked file
 */
function parseStatus(output: string): GitStatusResult {
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFileStatus[] = [];

  for (const line of output.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const name = line.slice("# branch.head ".length).trim();
      branch = name === "(detached)" ? null : name;
    } else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // Format: "1 XY sub-mode HEAD-mode worktree-mode HEAD-sha worktree-sha path"
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      const filePath = line.startsWith("2 ")
        ? (parts[parts.length - 2] ?? "")
        : (parts[parts.length - 1] ?? "");
      if (!filePath) continue;
      files.push({
        path: filePath,
        index: x,
        workingTree: y,
        staged: x !== "." && x !== "?",
      });
    } else if (line.startsWith("? ")) {
      files.push({
        path: line.slice(2),
        index: "?",
        workingTree: "?",
        staged: false,
      });
    }
  }

  return { ok: true, branch, ahead, behind, files };
}

export async function gitDiff(
  rootPath: string,
  rel: string,
  staged = false,
): Promise<GitDiffResult> {
  const safe = safeRelative(rootPath, rel);
  if (!safe) return { ok: false, diff: "", error: "Path escapes workspace" };

  const args = ["diff", "-U3", "--no-color"];
  if (staged) args.push("--cached");
  args.push("--", safe);

  const r = await runGit({ cwd: rootPath, args, timeoutMs: 10000 });
  if (r.code !== 0 && r.code !== 1) {
    return { ok: false, diff: "", error: r.stderr.trim() || "git diff failed" };
  }
  return { ok: true, diff: r.stdout };
}

export async function gitStage(
  rootPath: string,
  args: GitStageArgs,
): Promise<{ ok: boolean; error?: string }> {
  const paths: string[] = [];
  for (const p of args.paths) {
    const safe = safeRelative(rootPath, p);
    if (!safe) return { ok: false, error: `Path escapes workspace: ${p}` };
    paths.push(safe);
  }
  const r = await runGit({
    cwd: rootPath,
    args: [args.stage ? "add" : "reset", "--", ...paths],
    timeoutMs: 10000,
  });
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() };
}

export async function gitCommit(
  rootPath: string,
  args: GitCommitArgs,
): Promise<GitCommitResult> {
  const message = (args.message ?? "").trim();
  if (!message) return { ok: false, error: "Commit message is empty" };

  if (args.stageAll) {
    const stage = await runGit({ cwd: rootPath, args: ["add", "-A"], timeoutMs: 10000 });
    if (stage.code !== 0) {
      return { ok: false, error: stage.stderr.trim() || "git add -A failed" };
    }
  }

  const r = await runGit({
    cwd: rootPath,
    args: ["commit", "-F", "-"],
    stdin: message,
    timeoutMs: 15000,
  });
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() };
  }

  // Pull the new sha.
  const sha = await runGit({ cwd: rootPath, args: ["rev-parse", "HEAD"], timeoutMs: 3000 });
  return {
    ok: true,
    sha: sha.code === 0 ? sha.stdout.trim() : undefined,
  };
}

const ALLOWED_RUN: GitRunCommand[] = ["pull", "push", "fetch"];

export async function gitRun(
  rootPath: string,
  cmd: GitRunCommand,
): Promise<GitRunResult> {
  if (!ALLOWED_RUN.includes(cmd)) {
    return { ok: false, error: `Command not allowed: ${cmd}` };
  }
  const r = await runGit({
    cwd: rootPath,
    args: [cmd],
    timeoutMs: 60_000,
  });
  return {
    ok: r.code === 0,
    stdout: r.stdout,
    stderr: r.stderr,
    error: r.code === 0 ? undefined : r.stderr.trim() || `git ${cmd} failed`,
  };
}
