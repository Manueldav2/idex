# Changelog

All notable changes to IDEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — Phase 2

### Added
- **Real curator via GLM-4.6** (`z-ai/glm-4.6` on OpenRouter) with JSON-schema structured output, 5s timeout, graceful fallback to the deterministic planner.
- **Composio Twitter integration** — REST client for `TWITTER_SEARCH_TWEETS`, OAuth flow (initiate → external browser → poll `/connected_accounts/{id}` → persist `connectedAccountId`), token-bucket rate limiting (300 / 15 min per account), and a stale-while-revalidate in-memory cache (15 min TTL keyed on `${accountId}::${query}`).
- **Twitter oEmbed renderer** — when Composio returns `oembed.html`, cards render inside a sandboxed `srcdoc` iframe with `platform.twitter.com` whitelisted in the CSP. Falls back to the structured card when oEmbed is absent.
- **Settings drawer** — right-side drawer from the cockpit header: agent picker, OpenRouter + Composio key/auth-config inputs (stored in keychain only), Composio connection status + Connect X button, curator toggle, sponsored cards toggle, anonymous telemetry toggle, autoscroll speed slider, privacy panic mode.
- **Opt-in anonymous telemetry** — fire-and-forget 2s-timeout POST of `{ topicHash, cardId, action, source, ts }`. No prompts, no code, no handles. SHA-256 salted topic hash (with FNV-1a fallback for non-crypto envs). No-ops entirely when disabled or endpoint unset.
- **Adapter test fixtures + vitest** — 5 captured Claude Code TUI snapshots (idle, generating, agent-done, ANSI-colored prompt, short banner) and 6 `detect()` assertions.
- New IPC channels `composio:connectX` and `composio:status`, exposed on `window.idex.composio`.
- New `CuratorCredentials` + `curateLive()` async curator that interleaves Composio + HN + Reddit + Bluesky results and degrades gracefully on any failure.

### Changed
- Feed store now runs a two-pass refresh: synchronous starter cards first, then async `curateLive` with credentials. Stale in-flight responses are de-duped by request counter.
- CSP widened to allow `https://openrouter.ai`, `https://backend.composio.dev`, `https://api.composio.dev`, and `https://platform.twitter.com` (iframe) / `https://twitter.com` (frame-src).
- Cockpit Settings button now opens the Settings drawer instead of resetting the privacy disclosure.

## [v0.1.0.1] — 2026-04-20

### Fixed
- **Blank window on launch** — preload script was emitted as ES module, Electron 33 requires CommonJS. Now explicitly outputs CJS for both `main.js` and `preload.js`.
- Vite `base: "./"` so asset paths resolve correctly under the `file://` protocol inside asar.
- `type: "module"` removed from `apps/desktop/package.json` (Electron runs CJS by default; this also fixed the preload load).

## [v0.1.0] — 2026-04-19

### Added
- 🎉 First public release. macOS arm64 unsigned dmg + zip.
- Electron + React 19 + Tailwind 4 cockpit with glassmorphism chrome.
- Hosted Claude Code agent via `node-pty` + `xterm.js`.
- 3-step setup flow (welcome / agent picker / privacy disclosure).
- Picture-to-picture feed pane with peek + expanded states (Framer Motion).
- 12-card starter feed of evergreen developer tweets, ranked by topic overlap.
- Settings persisted to `~/.idex/config.json`; secrets stored in OS keychain via `keytar`.
- Landing site (Vite + React) with `ContainerScroll` 3D scroll-reveal hero (21st.dev / Aceternity).
- CI on macOS + Linux (typecheck + build).
- Full design spec at `docs/specs/2026-04-19-idex-design.md`.
- Phase 2 implementation plan at `docs/plans/2026-04-19-idex-phase2-curator-feed.md`.

### Known limitations
- macOS only. Linux + Windows on the v2 roadmap.
- Apple Silicon only in this build. x64 release coming after first user feedback.
- Unsigned — Gatekeeper warning on first launch is expected.
- Curator runs deterministic keyword extraction in v0.1.0 — real GLM-4.6 + Composio integration ships in Phase 2.
- Codex and Freebuff agent options are wired in the picker but disabled until Phase 2/3.

[v0.1.0]: https://github.com/Manueldav2/idex/releases/tag/v0.1.0
