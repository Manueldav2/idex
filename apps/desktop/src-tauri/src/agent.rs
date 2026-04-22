//! Agent host (PTY spawn + stream) — the Tauri equivalent of
//! `apps/desktop/electron/agent-host.ts`.
//!
//! Uses `portable-pty` (the same crate Wezterm and Zed use) to manage
//! cross-platform pseudo-terminals. Each session lives in its own task:
//! the reader pumps stdout chunks back to the renderer via Tauri events,
//! the writer takes IPC `agent:input` calls and forwards bytes to the
//! PTY master.
//!
//! Detection of agent vs user-prompt boundaries is a renderer concern in
//! the Electron version — it stays a renderer concern here too. The
//! Rust side is dumb pass-through.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Default)]
pub struct AgentRegistry {
    sessions: Mutex<HashMap<String, ActiveSession>>,
    app: Mutex<Option<AppHandle>>,
}

struct ActiveSession {
    agent_id: String,
    cwd: String,
    label: String,
    created_at: u64,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child_killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    /// Last time the reader produced a chunk. The idle watcher compares
    /// this against `IDLE_BOUNDARY_MS` to flip the session to "done" when
    /// Claude's spinner finally stops.
    last_chunk_at: Arc<Mutex<u128>>,
    /// Last state we told the renderer — prevents spamming redundant
    /// events every chunk.
    last_state: Arc<Mutex<String>>,
}

/// Idle cap — Claude Code's spinner emits frames every ~100ms while it's
/// working, so any threshold below ~1.5s keeps getting reset and the
/// session never transitions to "done". 2s is the Goldilocks value: it
/// feels instant on short answers, still resilient to mid-answer pauses.
const IDLE_BOUNDARY_MS: u128 = 2000;

static REG: once_cell::sync::Lazy<Arc<AgentRegistry>> =
    once_cell::sync::Lazy::new(|| Arc::new(AgentRegistry::default()));

pub fn init(app: AppHandle) {
    *REG.app.lock() = Some(app);
}

#[derive(Serialize, Clone)]
pub struct Session {
    pub id: String,
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub cwd: String,
    pub label: String,
    pub state: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
}

#[derive(Deserialize)]
pub struct SpawnArgs {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub cwd: Option<String>,
    pub label: Option<String>,
}

#[derive(Serialize)]
pub struct SpawnResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<Session>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
struct OutputChunk {
    #[serde(rename = "sessionId")]
    session_id: String,
    raw: String,
    clean: String,
    ts: u128,
}

#[derive(Serialize, Clone)]
struct StateEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    state: String,
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

fn shorten_home(p: &str) -> String {
    let h = home();
    if p.starts_with(&h) {
        format!("~{}", &p[h.len()..])
    } else {
        p.to_string()
    }
}

fn agent_command(agent_id: &str) -> (String, Vec<String>) {
    match agent_id {
        "claude-code" => (
            "claude".to_string(),
            vec!["--dangerously-skip-permissions".to_string()],
        ),
        "codex" => ("codex".to_string(), vec![]),
        "freebuff" => ("freebuff".to_string(), vec![]),
        "shell" => {
            let s = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            (s, vec!["-l".to_string()])
        }
        _ => ("/bin/zsh".to_string(), vec!["-l".to_string()]),
    }
}

fn display_name(agent_id: &str) -> &'static str {
    match agent_id {
        "claude-code" => "Claude Code",
        "codex" => "Codex",
        "freebuff" => "Freebuff",
        "shell" => "Shell",
        _ => "Agent",
    }
}

fn extra_paths() -> Vec<String> {
    let h = home();
    let mut out = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{h}/.volta/bin"),
        format!("{h}/.bun/bin"),
        format!("{h}/.pnpm/bin"),
    ];
    let nvm_root = format!("{h}/.nvm/versions/node");
    if let Ok(rd) = std::fs::read_dir(&nvm_root) {
        for entry in rd.flatten() {
            out.push(format!("{}/bin", entry.path().display()));
        }
    }
    out
}

#[tauri::command]
pub async fn agent_spawn(args: SpawnArgs) -> Result<SpawnResult, String> {
    let agent_id = args.agent_id;
    let cwd = args
        .cwd
        .filter(|s| !s.is_empty())
        .unwrap_or_else(home);
    let session_id = Uuid::new_v4().to_string();
    let (cmd, cmd_args) = agent_command(&agent_id);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 32,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut command = CommandBuilder::new(&cmd);
    command.args(&cmd_args);
    command.cwd(&cwd);
    let path_var = std::env::var("PATH").unwrap_or_default();
    let augmented_path = format!("{}:{}", extra_paths().join(":"), path_var);
    command.env("PATH", &augmented_path);
    command.env("TERM", "xterm-256color");
    command.env("FORCE_COLOR", "1");

    let mut child = match pair.slave.spawn_command(command) {
        Ok(c) => c,
        Err(e) => {
            return Ok(SpawnResult {
                ok: false,
                session: None,
                error: Some(format!(
                    "Failed to spawn '{}': {}. Is it installed and on PATH?",
                    cmd, e
                )),
            });
        }
    };
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let label = args.label.unwrap_or_else(|| {
        let tail = std::path::Path::new(&cwd)
            .components()
            .rev()
            .take(2)
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("/");
        let display_path = if tail.is_empty() { "~".to_string() } else { tail };
        format!("{} · {}", display_name(&agent_id), shorten_home(&display_path))
    });

    let killer = child.clone_killer();
    let session = Session {
        id: session_id.clone(),
        agent_id: agent_id.clone(),
        cwd: cwd.clone(),
        label: label.clone(),
        state: "idle".to_string(),
        created_at: now_ms() as u64,
    };

    {
        let mut sessions = REG.sessions.lock();
        sessions.insert(
            session_id.clone(),
            ActiveSession {
                agent_id: agent_id.clone(),
                cwd: cwd.clone(),
                label: label.clone(),
                created_at: session.created_at,
                master: Arc::new(Mutex::new(pair.master)),
                writer: Arc::new(Mutex::new(writer)),
                child_killer: Arc::new(Mutex::new(killer)),
                last_chunk_at: Arc::new(Mutex::new(now_ms())),
                last_state: Arc::new(Mutex::new("idle".to_string())),
            },
        );
    }

    // Shared state refs for the reader + idle watcher threads. Both
    // threads need to read/write last_chunk_at, and emit state events
    // via the same de-dup'd channel.
    let last_chunk_at = REG
        .sessions
        .lock()
        .get(&session_id)
        .map(|s| s.last_chunk_at.clone())
        .unwrap();
    let last_state = REG
        .sessions
        .lock()
        .get(&session_id)
        .map(|s| s.last_state.clone())
        .unwrap();

    // Reader task — pump stdout chunks back to the renderer and keep
    // the last-chunk timestamp fresh.
    let app_for_reader = REG.app.lock().clone();
    let sid = session_id.clone();
    let last_chunk_for_reader = last_chunk_at.clone();
    let last_state_for_reader = last_state.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let now = now_ms();
                    *last_chunk_for_reader.lock() = now;

                    // Any output = agent is actively generating. Emit only
                    // on state change so we don't flood the renderer.
                    {
                        let mut cur = last_state_for_reader.lock();
                        if *cur != "generating" {
                            *cur = "generating".to_string();
                            if let Some(app) = &app_for_reader {
                                let _ = app.emit(
                                    "agent:state",
                                    StateEvent {
                                        session_id: sid.clone(),
                                        state: "generating".to_string(),
                                    },
                                );
                            }
                        }
                    }

                    let raw = String::from_utf8_lossy(&buf[..n]).to_string();
                    let clean = strip_ansi(&raw);
                    if let Some(app) = &app_for_reader {
                        let _ = app.emit(
                            "agent:output",
                            OutputChunk {
                                session_id: sid.clone(),
                                raw,
                                clean,
                                ts: now,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
        // Process exited or read failed → emit done state, drop session.
        if let Some(app) = &app_for_reader {
            let _ = app.emit(
                "agent:state",
                StateEvent {
                    session_id: sid.clone(),
                    state: "done".to_string(),
                },
            );
        }
        REG.sessions.lock().remove(&sid);
    });

    // Idle watcher — polls every 300ms. If the last output was more than
    // IDLE_BOUNDARY_MS ago and we're still flagged as "generating", flip
    // to "done" so the feed can auto-collapse and the cockpit snaps back
    // to the agent transcript.
    let app_for_watcher = REG.app.lock().clone();
    let sid_for_watcher = session_id.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(300));
            // Session removed → reader exited → stop watching.
            if !REG.sessions.lock().contains_key(&sid_for_watcher) {
                return;
            }
            let since = now_ms().saturating_sub(*last_chunk_at.lock());
            if since >= IDLE_BOUNDARY_MS {
                let mut cur = last_state.lock();
                if *cur == "generating" {
                    *cur = "done".to_string();
                    if let Some(app) = &app_for_watcher {
                        let _ = app.emit(
                            "agent:state",
                            StateEvent {
                                session_id: sid_for_watcher.clone(),
                                state: "done".to_string(),
                            },
                        );
                    }
                }
            }
        }
    });

    // Reaper — wait on the child so portable-pty cleans up properly.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    if let Some(app) = REG.app.lock().clone() {
        let _ = app.emit(
            "agent:state",
            StateEvent {
                session_id: session_id.clone(),
                state: "idle".to_string(),
            },
        );
    }

    Ok(SpawnResult {
        ok: true,
        session: Some(session),
        error: None,
    })
}

#[derive(Deserialize)]
pub struct InputArgs {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub text: String,
}

#[tauri::command]
pub async fn agent_input(args: InputArgs) -> Result<(), String> {
    let writer = {
        let sessions = REG.sessions.lock();
        sessions
            .get(&args.session_id)
            .map(|s| s.writer.clone())
    };
    if let Some(w) = writer {
        let mut w = w.lock();
        w.write_all(args.text.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct ResizeArgs {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn agent_resize(args: ResizeArgs) -> Result<(), String> {
    let master = {
        let sessions = REG.sessions.lock();
        sessions
            .get(&args.session_id)
            .map(|s| s.master.clone())
    };
    if let Some(m) = master {
        let m = m.lock();
        m.resize(PtySize {
            rows: args.rows,
            cols: args.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_kill(session_id: String) -> Result<(), String> {
    let killer = {
        let mut sessions = REG.sessions.lock();
        sessions.remove(&session_id).map(|s| s.child_killer)
    };
    if let Some(k) = killer {
        let _ = k.lock().kill();
        if let Some(app) = REG.app.lock().clone() {
            let _ = app.emit(
                "agent:state",
                StateEvent {
                    session_id,
                    state: "idle".to_string(),
                },
            );
        }
    }
    Ok(())
}

/* ────────────────────────────────────────── *
 * External (Terminal.app) launching          *
 * ────────────────────────────────────────── */

#[derive(Deserialize)]
pub struct ExternalLaunchArgs {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub cwd: String,
    #[serde(default, rename = "initialPrompt")]
    pub initial_prompt: Option<String>,
}

#[derive(Serialize)]
pub struct ExternalLaunchResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none", rename = "windowId")]
    pub window_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn external_command_for(agent_id: &str) -> &'static str {
    match agent_id {
        "claude-code" => "exec claude",
        "codex" => "exec codex",
        "freebuff" => "exec freebuff",
        _ => "exec $SHELL -l",
    }
}

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn osascript_arg_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

#[tauri::command]
pub async fn agent_launch_external(opts: ExternalLaunchArgs) -> Result<ExternalLaunchResult, String> {
    let cwd = if opts.cwd.is_empty() { home() } else { opts.cwd };
    let cmd = external_command_for(&opts.agent_id);

    // Same PATH augmentation as the in-process spawn — Launch Services
    // gives shells a stripped PATH, so without this Terminal.app
    // typically can't find `claude`.
    let extras = extra_paths().join(":");
    let export_path = format!("export PATH=\"{}:$PATH\"", extras);
    let cd_line = format!("cd \"{}\"", applescript_escape(&cwd));
    let prompt_line = match opts.initial_prompt.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            // Single-quote the prompt for safe inclusion in the bash line.
            let safe = s.replace('\'', "'\\''");
            format!(" && printf %s '{}'", safe)
        }
        _ => String::new(),
    };
    let full_cmd = format!("{} && {} && {}{}", export_path, cd_line, cmd, prompt_line);

    let script = format!(
        "tell application \"Terminal\"\nactivate\nset newTab to do script \"{}\"\nset windowId to id of (window 1 whose tabs contains newTab)\nreturn windowId\nend tell",
        applescript_escape(&full_cmd)
    );

    let escaped = osascript_arg_escape(&script);
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&escaped)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let window_id = stdout.parse::<i64>().ok();
            let label = friendly_external_label(&opts.agent_id, &cwd);
            Ok(ExternalLaunchResult {
                ok: true,
                window_id,
                label: Some(label),
                error: None,
            })
        }
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr).to_string();
            Ok(ExternalLaunchResult {
                ok: false,
                window_id: None,
                label: None,
                error: Some(err),
            })
        }
        Err(e) => Ok(ExternalLaunchResult {
            ok: false,
            window_id: None,
            label: None,
            error: Some(e.to_string()),
        }),
    }
}

fn friendly_external_label(agent_id: &str, cwd: &str) -> String {
    let display = display_name(agent_id);
    let short = shorten_home(
        &std::path::Path::new(cwd)
            .components()
            .rev()
            .take(2)
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("/"),
    );
    format!("{} · {}", display, short)
}

#[tauri::command]
pub async fn agent_list() -> Result<Vec<Session>, String> {
    let sessions = REG.sessions.lock();
    Ok(sessions
        .iter()
        .map(|(id, s)| Session {
            id: id.clone(),
            agent_id: s.agent_id.clone(),
            cwd: s.cwd.clone(),
            label: s.label.clone(),
            state: "idle".to_string(),
            created_at: s.created_at,
        })
        .collect())
}

/// Minimal ANSI stripper — port of the renderer-side helper. We strip CSI
/// (ESC [ ...) and OSC (ESC ] ... BEL/ST) escapes so the `clean` chunk we
/// emit to the renderer is plain text the curator can tokenize.
///
/// Operates on the &str chars rather than raw bytes so multi-byte UTF-8
/// characters (Claude Code uses plenty of box-drawing and emoji) survive
/// intact instead of being broken into garbage replacement chars.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // ESC sequence
            match chars.next() {
                Some('[') => {
                    // CSI: skip until ASCII alphabetic terminator
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() || next == '~' {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC: skip until BEL or ST (ESC \)
                    while let Some(c2) = chars.next() {
                        if c2 == '\u{7}' {
                            break;
                        }
                        if c2 == '\u{1b}' {
                            if matches!(chars.peek(), Some('\\')) {
                                chars.next();
                            }
                            break;
                        }
                    }
                }
                Some(_) => {
                    // 2-char escape (eg. ESC = ESC > etc.) — drop both
                }
                None => break,
            }
            continue;
        }
        out.push(c);
    }
    out
}
