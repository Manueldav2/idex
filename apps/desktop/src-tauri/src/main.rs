//! IDEX desktop — Tauri 2 entry point.
//!
//! This Rust binary is the parallel-universe replacement for the Electron
//! main process under `electron/`. The web frontend (apps/desktop/src) is
//! shared verbatim between the two backends; the renderer detects which
//! shell it's running inside via `window.__TAURI_INTERNALS__` and routes
//! IPC accordingly (see `src/lib/ipc.ts`).
//!
//! Goals for this first cut:
//!   1. Open a window that loads the same Vite dev server / built assets
//!      as Electron does.
//!   2. Wire up the safe-to-port commands first: config get/set,
//!      keychain, openExternal, workspace open/tree/read/write, project
//!      create-folder.
//!   3. Get the agent + integrated-terminal PTY surface working via
//!      portable-pty. (Tracked as a follow-up — the simpler commands
//!      land first so the renderer can boot under Tauri immediately.)
//!
//! Modules:
//!   * `config`   – AppConfig persistence at ~/.idex/config.json
//!   * `keychain` – OS keychain wrappers using the `keyring` crate
//!   * `workspace` – file-tree walking + read/write/create-folder
//!   * `agent`    – PTY spawn + stream (portable-pty + tokio) [stub]

mod agent;
mod config;
mod keychain;
mod workspace;

use tracing_subscriber::EnvFilter;

fn main() {
    // Same env-var convention as Electron build: IDEX_LOG=debug.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("IDEX_LOG").unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            // Make the AppHandle reachable from agent::* so PTY events
            // can emit to the window.
            agent::init(app.handle().clone());
            tracing::info!("idex tauri shell booted");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // config
            config::get_config,
            config::set_config,
            // keychain
            keychain::keychain_get,
            keychain::keychain_set,
            // shell
            open_external,
            // workspace
            workspace::workspace_open,
            workspace::workspace_tree,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            workspace::projects_create_folder,
            // agent
            agent::agent_spawn,
            agent::agent_input,
            agent::agent_resize,
            agent::agent_kill,
            agent::agent_list,
            agent::agent_launch_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Forward an external URL to the OS browser. Mirrors Electron's
/// `shell.openExternal` and the renderer's `window.idex.openExternal`.
///
/// We bypass the shell-plugin's deprecated `open` helper and call the
/// platform's `open` directly. Three reasons: (1) it avoids a build-time
/// deprecation warning we'd otherwise have to silence, (2) it sidesteps
/// the plugin's URL allow-list, which we control at the renderer layer
/// already, (3) it's one syscall — the plugin's wrapper does extra
/// scheme parsing we don't need.
#[tauri::command]
async fn open_external(url: String) -> Result<bool, String> {
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "start"
    } else {
        "xdg-open"
    };
    std::process::Command::new(cmd)
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(true)
}
