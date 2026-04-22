# IDEX — Tauri shell

This directory is the parallel-universe replacement for the Electron main
process under `electron/`. Both backends host the **same React frontend**
in `apps/desktop/src/`. At boot the renderer detects which shell it's
inside (`window.__TAURI_INTERNALS__`) and installs the matching IPC
bridge — see `apps/desktop/src/lib/ipc-tauri.ts`.

The Tauri backend is staged in. To run it you need a Rust toolchain.

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
pnpm dev:tauri            # boots the Tauri shell against the same Vite dev server
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
- `open_external` → `tauri-plugin-shell`'s open()

## What's still on Electron

Bundling. The `electron-builder` release pipeline (`pnpm build:mac`) is
unchanged. To produce a Tauri build, `pnpm build:tauri` from the repo
root — that runs `tauri build` and emits a `.app` + `.dmg` into
`apps/desktop/src-tauri/target/release/bundle`.

## Coexistence with Electron

Electron stays the default for now. Nothing in `electron/` was modified
during this scaffold. To switch your daily-driver run:

- `pnpm dev:desktop` → Electron (existing behavior)
- `pnpm dev:tauri` → Tauri (new path)

When the Tauri build is stable for everything you do daily, we'll flip
the default and remove Electron.
