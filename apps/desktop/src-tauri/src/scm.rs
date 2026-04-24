//! Source control bridge — Rust port of `electron/scm.ts`.
//!
//! Shells out to `git --no-pager` so we never spawn `less`. Same IPC
//! shape as the Electron handlers: status / diff / stage / commit / run.
//! Path-safety: every workspace-relative path argument is resolved
//! against the root and refused if it escapes.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

/* ────────────────────────────────────────── *
 * IPC payload types                          *
 * ────────────────────────────────────────── */

#[derive(Serialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub index: String,
    #[serde(rename = "workingTree")]
    pub working_tree: String,
    pub staged: bool,
}

#[derive(Serialize)]
pub struct GitStatusResult {
    pub ok: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct GitDiffResult {
    pub ok: bool,
    pub diff: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct StageArgs {
    pub paths: Vec<String>,
    pub stage: bool,
}

#[derive(Deserialize)]
pub struct CommitArgs {
    pub message: String,
    #[serde(default, rename = "stageAll")]
    pub stage_all: bool,
}

#[derive(Serialize)]
pub struct CommitResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct StageResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct RunResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/* ────────────────────────────────────────── *
 * git runner                                 *
 * ────────────────────────────────────────── */

struct GitRun {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run_git(cwd: &str, args: &[&str], stdin: Option<&str>, timeout: Duration) -> GitRun {
    let mut cmd = Command::new("git");
    cmd.arg("--no-pager");
    for a in args {
        cmd.arg(a);
    }
    cmd.current_dir(cwd);
    if stdin.is_some() {
        cmd.stdin(Stdio::piped());
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return GitRun {
                code: -1,
                stdout: String::new(),
                stderr: if e.kind() == std::io::ErrorKind::NotFound {
                    "git not installed".to_string()
                } else {
                    e.to_string()
                },
            };
        }
    };

    if let Some(input) = stdin {
        if let Some(mut sin) = child.stdin.take() {
            let _ = sin.write_all(input.as_bytes());
        }
    }

    // Naive timeout via wait + sleep loop. portable-pty's child::wait
    // is blocking; we approximate a deadline by polling try_wait every
    // 50ms and SIGTERM-ing once we exceed the budget.
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let out = child.wait_with_output().ok();
                    return GitRun {
                        code: -1,
                        stdout: String::new(),
                        stderr: out
                            .map(|o| String::from_utf8_lossy(&o.stderr).to_string())
                            .unwrap_or_else(|| "git timed out".to_string()),
                    };
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                return GitRun {
                    code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                };
            }
        }
    }

    let output = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            return GitRun {
                code: -1,
                stdout: String::new(),
                stderr: e.to_string(),
            };
        }
    };
    GitRun {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    }
}

fn safe_relative(root: &str, rel: &str) -> Option<String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return None;
    }
    let abs: PathBuf = Path::new(root).join(rel_path);
    let canonical = abs.canonicalize().ok().unwrap_or(abs.clone());
    let root_canonical = Path::new(root).canonicalize().ok()?;
    if !canonical.starts_with(&root_canonical) {
        return None;
    }
    canonical
        .strip_prefix(&root_canonical)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

fn parse_status(output: &str) -> GitStatusResult {
    let mut branch: Option<String> = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut files: Vec<GitFileStatus> = Vec::new();

    for line in output.split('\n') {
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            let name = rest.trim();
            branch = if name == "(detached)" {
                None
            } else {
                Some(name.to_string())
            };
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // format: "+<ahead> -<behind>"
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            let parts: Vec<&str> = line.split(' ').collect();
            let xy = parts.get(1).copied().unwrap_or("..");
            let mut chars = xy.chars();
            let x = chars.next().unwrap_or('.');
            let y = chars.next().unwrap_or('.');
            let path = if line.starts_with("2 ") {
                parts.get(parts.len().saturating_sub(2)).copied().unwrap_or("")
            } else {
                parts.last().copied().unwrap_or("")
            };
            if path.is_empty() {
                continue;
            }
            files.push(GitFileStatus {
                path: path.to_string(),
                index: x.to_string(),
                working_tree: y.to_string(),
                staged: x != '.' && x != '?',
            });
        } else if let Some(rest) = line.strip_prefix("? ") {
            files.push(GitFileStatus {
                path: rest.to_string(),
                index: "?".to_string(),
                working_tree: "?".to_string(),
                staged: false,
            });
        }
    }

    GitStatusResult {
        ok: true,
        branch,
        ahead,
        behind,
        files,
        error: None,
    }
}

/* ────────────────────────────────────────── *
 * Tauri commands                             *
 * ────────────────────────────────────────── */

#[tauri::command]
pub async fn scm_status(root_path: String) -> Result<GitStatusResult, String> {
    let rootPath = root_path;
    if rootPath.is_empty() {
        return Ok(GitStatusResult {
            ok: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            error: Some("No workspace open".to_string()),
        });
    }
    let inside = run_git(
        &rootPath,
        &["rev-parse", "--is-inside-work-tree"],
        None,
        Duration::from_secs(3),
    );
    if inside.code != 0 {
        return Ok(GitStatusResult {
            ok: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            error: Some("Not a git repository".to_string()),
        });
    }
    let status = run_git(
        &rootPath,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
        ],
        None,
        Duration::from_secs(5),
    );
    if status.code != 0 {
        return Ok(GitStatusResult {
            ok: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            error: Some(if status.stderr.trim().is_empty() {
                "git status failed".to_string()
            } else {
                status.stderr.trim().to_string()
            }),
        });
    }
    Ok(parse_status(&status.stdout))
}

#[tauri::command]
pub async fn scm_diff(
    root_path: String,
    path: String,
    staged: Option<bool>,
) -> Result<GitDiffResult, String> {
    let rootPath = root_path;
    let staged = staged.unwrap_or(false);
    let safe = match safe_relative(&rootPath, &path) {
        Some(s) => s,
        None => {
            return Ok(GitDiffResult {
                ok: false,
                diff: String::new(),
                error: Some("Path escapes workspace".to_string()),
            });
        }
    };
    let mut args: Vec<&str> = vec!["diff", "-U3", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&safe);
    let r = run_git(&rootPath, &args, None, Duration::from_secs(10));
    // git diff returns 1 when there are differences (not an error).
    if r.code != 0 && r.code != 1 {
        return Ok(GitDiffResult {
            ok: false,
            diff: String::new(),
            error: Some(if r.stderr.trim().is_empty() {
                "git diff failed".to_string()
            } else {
                r.stderr.trim().to_string()
            }),
        });
    }
    Ok(GitDiffResult {
        ok: true,
        diff: r.stdout,
        error: None,
    })
}

#[tauri::command]
pub async fn scm_stage(
    root_path: String,
    args: StageArgs,
) -> Result<StageResult, String> {
    let rootPath = root_path;
    let mut paths: Vec<String> = Vec::new();
    for p in &args.paths {
        match safe_relative(&rootPath, p) {
            Some(s) => paths.push(s),
            None => {
                return Ok(StageResult {
                    ok: false,
                    error: Some(format!("Path escapes workspace: {}", p)),
                });
            }
        }
    }
    let mut argv: Vec<&str> = vec![if args.stage { "add" } else { "reset" }, "--"];
    for p in &paths {
        argv.push(p);
    }
    let r = run_git(&rootPath, &argv, None, Duration::from_secs(10));
    if r.code == 0 {
        Ok(StageResult { ok: true, error: None })
    } else {
        Ok(StageResult {
            ok: false,
            error: Some(r.stderr.trim().to_string()),
        })
    }
}

#[tauri::command]
pub async fn scm_commit(
    root_path: String,
    args: CommitArgs,
) -> Result<CommitResult, String> {
    let rootPath = root_path;
    let message = args.message.trim().to_string();
    if message.is_empty() {
        return Ok(CommitResult {
            ok: false,
            sha: None,
            error: Some("Commit message is empty".to_string()),
        });
    }
    if args.stage_all {
        let r = run_git(&rootPath, &["add", "-A"], None, Duration::from_secs(10));
        if r.code != 0 {
            return Ok(CommitResult {
                ok: false,
                sha: None,
                error: Some(if r.stderr.trim().is_empty() {
                    "git add -A failed".to_string()
                } else {
                    r.stderr.trim().to_string()
                }),
            });
        }
    }
    let r = run_git(
        &rootPath,
        &["commit", "-F", "-"],
        Some(&message),
        Duration::from_secs(15),
    );
    if r.code != 0 {
        let err = if !r.stderr.trim().is_empty() {
            r.stderr.trim().to_string()
        } else if !r.stdout.trim().is_empty() {
            r.stdout.trim().to_string()
        } else {
            "git commit failed".to_string()
        };
        return Ok(CommitResult {
            ok: false,
            sha: None,
            error: Some(err),
        });
    }
    let sha = run_git(&rootPath, &["rev-parse", "HEAD"], None, Duration::from_secs(3));
    Ok(CommitResult {
        ok: true,
        sha: if sha.code == 0 {
            Some(sha.stdout.trim().to_string())
        } else {
            None
        },
        error: None,
    })
}

#[tauri::command]
pub async fn scm_run(root_path: String, cmd: String) -> Result<RunResult, String> {
    let rootPath = root_path;
    let allowed = matches!(cmd.as_str(), "pull" | "push" | "fetch");
    if !allowed {
        return Ok(RunResult {
            ok: false,
            stdout: None,
            stderr: None,
            error: Some(format!("Command not allowed: {}", cmd)),
        });
    }
    let r = run_git(&rootPath, &[cmd.as_str()], None, Duration::from_secs(60));
    Ok(RunResult {
        ok: r.code == 0,
        stdout: Some(r.stdout.clone()),
        stderr: Some(r.stderr.clone()),
        error: if r.code == 0 {
            None
        } else if r.stderr.trim().is_empty() {
            Some(format!("git {} failed", cmd))
        } else {
            Some(r.stderr.trim().to_string())
        },
    })
}
