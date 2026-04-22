//! Workspace + project commands. Mirrors the renderer's
//! `window.idex.workspace.*` and `window.idex.projects.*` APIs.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

/// Folders we never expand into the file tree. Matches WORKSPACE_IGNORE
/// in @idex/types — should stay in sync; future work could ship the set
/// over IPC so it's truly single-sourced.
const IGNORE: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "release",
    ".turbo",
    "coverage",
];

#[derive(Serialize)]
pub struct WorkspaceOpenResult {
    pub path: String,
}

#[tauri::command]
pub async fn workspace_open(app: AppHandle) -> Result<Option<WorkspaceOpenResult>, String> {
    let chosen = app
        .dialog()
        .file()
        .set_title("Open workspace")
        .blocking_pick_folder();
    match chosen {
        Some(FilePath::Path(p)) => Ok(Some(WorkspaceOpenResult {
            path: p.to_string_lossy().to_string(),
        })),
        Some(FilePath::Url(u)) => Ok(Some(WorkspaceOpenResult {
            path: u.to_string(),
        })),
        None => Ok(None),
    }
}

#[derive(Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: String, // "file" | "dir"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

fn walk(path: &Path, depth: usize, max_depth: usize) -> Option<FileNode> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let metadata = fs::symlink_metadata(path).ok()?;

    if metadata.is_dir() {
        if IGNORE.iter().any(|n| *n == name) {
            return None;
        }
        let mut children: Vec<FileNode> = Vec::new();
        if depth < max_depth {
            if let Ok(rd) = fs::read_dir(path) {
                let mut entries: Vec<_> = rd.flatten().collect();
                // Folders first, then files; alphabetical within group.
                entries.sort_by(|a, b| {
                    let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    match (a_dir, b_dir) {
                        (true, false) => std::cmp::Ordering::Less,
                        (false, true) => std::cmp::Ordering::Greater,
                        _ => a
                            .file_name()
                            .to_string_lossy()
                            .to_lowercase()
                            .cmp(&b.file_name().to_string_lossy().to_lowercase()),
                    }
                });
                for e in entries {
                    if let Some(child) = walk(&e.path(), depth + 1, max_depth) {
                        children.push(child);
                    }
                }
            }
        }
        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            kind: "dir".to_string(),
            children: Some(children),
        })
    } else {
        Some(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            kind: "file".to_string(),
            children: None,
        })
    }
}

#[tauri::command]
pub fn workspace_tree(root_path: String) -> Result<Option<FileNode>, String> {
    let p = PathBuf::from(&root_path);
    if !p.exists() {
        return Ok(None);
    }
    // Two levels is enough for the initial render — deeper folders lazy-
    // load when the user expands a directory in the UI. Same depth as the
    // Electron version.
    Ok(walk(&p, 0, 4))
}

#[derive(Serialize)]
pub struct ReadFileResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn workspace_read_file(file_path: String) -> Result<ReadFileResult, String> {
    match fs::read_to_string(&file_path) {
        Ok(content) => Ok(ReadFileResult {
            ok: true,
            content: Some(content),
            error: None,
        }),
        Err(e) => Ok(ReadFileResult {
            ok: false,
            content: None,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Serialize)]
pub struct WriteFileResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn workspace_write_file(file_path: String, content: String) -> Result<WriteFileResult, String> {
    match fs::write(&file_path, content) {
        Ok(_) => Ok(WriteFileResult { ok: true, error: None }),
        Err(e) => Ok(WriteFileResult {
            ok: false,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Deserialize)]
pub struct CreateFolderArgs {
    pub parent_dir: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct CreateFolderResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn projects_create_folder(args: CreateFolderArgs) -> Result<CreateFolderResult, String> {
    // Refuse anything that would escape the parent dir or touch dotfiles.
    if args.name.contains('/') || args.name.contains('\\') || args.name.starts_with('.') {
        return Ok(CreateFolderResult {
            ok: false,
            path: None,
            error: Some("Folder name must not contain separators or start with '.'".into()),
        });
    }
    let mut p = PathBuf::from(&args.parent_dir);
    p.push(&args.name);
    if p.exists() {
        return Ok(CreateFolderResult {
            ok: false,
            path: None,
            error: Some(format!("'{}' already exists", p.display())),
        });
    }
    match fs::create_dir_all(&p) {
        Ok(_) => Ok(CreateFolderResult {
            ok: true,
            path: Some(p.to_string_lossy().to_string()),
            error: None,
        }),
        Err(e) => Ok(CreateFolderResult {
            ok: false,
            path: None,
            error: Some(e.to_string()),
        }),
    }
}
