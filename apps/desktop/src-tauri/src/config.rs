//! AppConfig persistence — mirror of `apps/desktop/electron/main.ts` config
//! handling so the renderer's `window.idex.config.get/set` works the same
//! way under Tauri.
//!
//! Storage: `~/.idex/config.json`. Schema is whatever the renderer sends —
//! we treat it as opaque JSON. The schema is owned by `@idex/types`, not
//! this Rust binary, so we never need to bump anything here when fields
//! are added on the TS side.

use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn config_dir() -> Result<PathBuf> {
    let home = dirs_home()?;
    Ok(home.join(".idex"))
}

fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

/// Returns the value of $HOME (or %USERPROFILE% on Windows). We avoid an
/// extra crate by reading env directly — the std lib gives us this for
/// free and we don't need the full `dirs` crate just for this.
fn dirs_home() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .context("HOME / USERPROFILE not set")
}

#[tauri::command]
pub fn get_config() -> Result<Value, String> {
    let path = config_path().map_err(|e| e.to_string())?;
    if !path.exists() {
        // Renderer applies DEFAULT_APP_CONFIG when it sees an empty {}.
        // We don't duplicate the defaults in Rust — keeps the schema
        // single-sourced in @idex/types.
        return Ok(serde_json::json!({}));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&raw).unwrap_or(Value::Object(Default::default()));
    Ok(v)
}

#[tauri::command]
pub fn set_config(patch: Value) -> Result<Value, String> {
    let dir = config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = config_path().map_err(|e| e.to_string())?;

    // Read current, merge top-level keys (matches the Electron behavior
    // where `set` is patch-style, not full replacement).
    let mut current: Value = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    };

    if let (Some(cur_obj), Some(patch_obj)) = (current.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_obj {
            cur_obj.insert(k.clone(), v.clone());
        }
    } else {
        current = patch;
    }

    let pretty = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())?;
    Ok(current)
}
