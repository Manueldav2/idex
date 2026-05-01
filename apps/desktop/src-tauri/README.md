# IDEX — Tauri shell

This directory is the default desktop shell for IDEX. It replaces the
legacy Electron main process under `electron/` while hosting the same
React frontend in `apps/desktop/src/`. At boot the renderer detects the
Tauri webview (`window.__TAURI_INTERNALS__`) and installs the matching
IPC bridge — see `apps/desktop/src/lib/ipc-tauri.ts`.

To run the desktop app you need a Rust toolchain.

## Install Rust (one-time)

In Claude Code, paste this with the `!` prefix so it runs in your shell:

```
! curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

Then either restart your shell or `source $HOME/.cargo/env`.

## Run

From the repo root:

```sh
pnpm install              # picks up @tauri-apps/api and @tauri-apps/cli
pnpm dev:desktop          # boots the Tauri shell
```

The first `cargo build` will take 5-10 minutes — it's compiling all
Tauri/portable-pty/keyring deps from source. Subsequent builds are
incremental and fast.

## What's wired

- `config::*` → `~/.idex/config.json` (matches Electron behavior)
- `keychain::*` → OS keychain via the `keyring` crate
- `workspace::*` → folder open dialog, file tree (4 levels deep), read /
  write file, create folder
- `agent::*` → PTY spawn / input / resize / kill / list via
  `portable-pty`. Output streams to the renderer as `agent:output`
  events; state changes as `agent:state`.
- `search_workspace` → ripgrep-backed workspace search
- `scm::*` → git status, diff, stage, commit, pull/push/fetch
- `open_external` → `tauri-plugin-shell`'s open()

## Known Tauri Parity Gaps

- Composio/X OAuth is still stubbed in `apps/desktop/src/lib/ipc-tauri.ts`.
  The curator still works with no-auth sources and direct frontend HTTP
  fetches, but hosted Composio connect/status is not wired in Rust yet.
- Apple signing, notarization, and updater channel are not configured yet.

## Build

From the repo root:

```sh
pnpm build:desktop
```

That runs `tauri build` and emits a `.app` + `.dmg` into
`apps/desktop/src-tauri/target/release/bundle`.

## Legacy Electron Fallback

Electron is still available explicitly while the Tauri shell finishes
parity work:

- `pnpm dev:electron` → legacy Electron dev shell
- `pnpm build:electron` → legacy Electron renderer/main build
