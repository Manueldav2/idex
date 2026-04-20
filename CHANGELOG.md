# Changelog

All notable changes to IDEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
