//! Workspace search via ripgrep — Rust port of `electron/workspace-search.ts`.
//!
//! Shells out to `rg --json`, parses the streaming JSON line protocol, and
//! coalesces matches into per-file groups. Same options surface as the
//! Electron version (regex, case, whole-word, include/exclude globs,
//! maxMatches cap) so the renderer's `search.workspace` IPC works
//! identically across both backends.
//!
//! If `rg` isn't on PATH we return a clear "ripgrep not installed" error
//! instead of crashing — same contract as the Electron path.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

#[derive(Deserialize)]
pub struct SearchOptions {
    pub query: String,
    #[serde(default, rename = "isRegex")]
    pub is_regex: bool,
    #[serde(default, rename = "caseSensitive")]
    pub case_sensitive: bool,
    #[serde(default, rename = "wholeWord")]
    pub whole_word: bool,
    #[serde(default)]
    pub include: Option<Vec<String>>,
    #[serde(default)]
    pub exclude: Option<Vec<String>>,
    #[serde(default, rename = "maxMatches")]
    pub max_matches: Option<usize>,
}

#[derive(Serialize, Clone)]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub text: String,
    #[serde(rename = "matchLength")]
    pub match_length: u32,
}

#[derive(Serialize)]
pub struct SearchFileGroup {
    pub path: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub ok: bool,
    pub files: Vec<SearchFileGroup>,
    #[serde(rename = "totalMatches")]
    pub total_matches: usize,
    pub truncated: bool,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

const DEFAULT_EXCLUDES: &[&str] = &[
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/target/**",
    "**/.idex/**",
];

fn empty(elapsed: u128, error: Option<String>) -> SearchResult {
    SearchResult {
        ok: error.is_none(),
        files: Vec::new(),
        total_matches: 0,
        truncated: false,
        elapsed_ms: elapsed,
        error,
    }
}

/// Tauri's default arg-renaming maps the renderer's camelCase
/// `rootPath` to this `root_path` parameter automatically.
#[tauri::command]
pub async fn search_workspace(
    root_path: String,
    opts: SearchOptions,
) -> Result<SearchResult, String> {
    let root = root_path;
    let start = Instant::now();
    if root.is_empty() || opts.query.is_empty() {
        return Ok(empty(0, Some("Empty query".to_string())));
    }

    let cap = opts.max_matches.unwrap_or(5000).min(5000);

    let mut args: Vec<String> = vec![
        "--json".to_string(),
        "--max-count".to_string(),
        cap.to_string(),
        "--max-columns".to_string(),
        "300".to_string(),
        "--max-filesize".to_string(),
        "5M".to_string(),
        "--hidden".to_string(),
        "--no-ignore-dot".to_string(),
    ];
    if !opts.is_regex {
        args.push("--fixed-strings".to_string());
    }
    if !opts.case_sensitive {
        args.push("--smart-case".to_string());
    }
    if opts.whole_word {
        args.push("--word-regexp".to_string());
    }
    for inc in opts.include.as_deref().unwrap_or(&[]) {
        args.push("-g".to_string());
        args.push(inc.clone());
    }
    let combined_excludes = DEFAULT_EXCLUDES
        .iter()
        .map(|s| s.to_string())
        .chain(opts.exclude.unwrap_or_default());
    for exc in combined_excludes {
        args.push("-g".to_string());
        args.push(format!("!{}", exc));
    }
    args.push("--".to_string());
    args.push(opts.query);
    args.push(root.clone());

    let output = Command::new("rg").args(&args).current_dir(&root).output();

    let result = match output {
        Ok(o) => o,
        Err(e) => {
            let msg = if e.kind() == std::io::ErrorKind::NotFound {
                "ripgrep (rg) not installed — `brew install ripgrep`".to_string()
            } else {
                e.to_string()
            };
            return Ok(empty(start.elapsed().as_millis(), Some(msg)));
        }
    };

    // rg exit codes: 0 matches, 1 no matches, 2 real error
    let code = result.status.code().unwrap_or(-1);
    if code == 2 {
        let msg = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Ok(empty(
            start.elapsed().as_millis(),
            Some(if msg.is_empty() {
                "ripgrep exited with code 2".to_string()
            } else {
                msg
            }),
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout);
    let mut groups: std::collections::HashMap<String, Vec<SearchMatch>> =
        std::collections::HashMap::new();
    let mut total: usize = 0;
    let mut truncated = false;

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let kind = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
        if kind != "match" {
            continue;
        }
        let data = match v.get("data") {
            Some(d) => d,
            None => continue,
        };
        let path = data
            .get("path")
            .and_then(|p| p.get("text"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());
        let line_no = data
            .get("line_number")
            .and_then(|n| n.as_u64())
            .unwrap_or(0) as u32;
        let text = data
            .get("lines")
            .and_then(|l| l.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim_end_matches('\n')
            .to_string();
        let subs = data.get("submatches").and_then(|s| s.as_array());
        let (Some(file_abs), Some(subs)) = (path, subs) else {
            continue;
        };
        if text.is_empty() || subs.is_empty() {
            continue;
        }

        let rel = match Path::new(&file_abs).strip_prefix(&root) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => file_abs.clone(),
        };

        let bucket = groups.entry(rel.clone()).or_default();
        for s in subs {
            if total >= cap {
                truncated = true;
                break;
            }
            let start_col = s.get("start").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let end_col = s.get("end").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let truncated_text = if text.len() > 280 {
                text[..280].to_string()
            } else {
                text.clone()
            };
            let max_match = if start_col >= 280 {
                0
            } else {
                (end_col.saturating_sub(start_col)).min(280 - start_col)
            };
            bucket.push(SearchMatch {
                path: rel.clone(),
                line: line_no,
                column: start_col,
                text: truncated_text,
                match_length: max_match,
            });
            total += 1;
        }
        if truncated {
            break;
        }
    }

    let mut files: Vec<SearchFileGroup> = groups
        .into_iter()
        .map(|(p, mut m)| {
            m.sort_by_key(|x| x.line);
            SearchFileGroup { path: p, matches: m }
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(SearchResult {
        ok: true,
        files,
        total_matches: total,
        truncated,
        elapsed_ms: start.elapsed().as_millis(),
        error: None,
    })
}
