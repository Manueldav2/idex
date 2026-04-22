# IDEX Roadmap

## ✅ Phase 1 — Foundation (current)
*"Electron shell + Claude Code cockpit working end-to-end."*

- [x] Monorepo (pnpm workspaces, types/adapters/curator packages)
- [x] Electron main process + node-pty agent host
- [x] React 19 + Vite + Tailwind v4 renderer
- [x] xterm.js terminal embed with custom theme
- [x] Setup flow: welcome → agent picker → privacy disclosure
- [x] Settings store (zustand + `~/.idex/config.json`) + OS keychain wrapper
- [x] Cockpit with glass header + status pill + prompt input
- [x] Feed pane with peek/expanded modes, framer-motion transitions
- [x] Card renderer (fallback structured renderer)
- [x] Starter feed (12 evergreen dev tweets, works without API keys)
- [x] Landing site with ContainerScroll hero + 6 sections
- [x] electron-builder config (mac dmg/zip arm64+x64, unsigned)
- [x] CI on macOS + Linux (typecheck + build)

## ✅ Phase 2 — The magic moment
*"The feed actually pulls real, contextual content from X."*

- [x] Real Curator: GLM-4.6 via OpenRouter (structured-output JSON)
- [x] Composio integration: REST tool execution for `TWITTER_SEARCH_TWEETS`
- [x] OAuth flow with hosted Composio portal + status polling
- [x] Twitter oEmbed renderer (with fallback to structured Card)
- [x] Feed cache + token-bucket rate limiting
- [x] Curator settings panel (agent picker, keys, curator + telemetry toggles, panic mode)
- [x] Adapter test fixtures + vitest (captured Claude Code TUI snapshots)
- [x] Opt-in anonymous telemetry (topicHash + cardId + action, no PII)

## 🚀 Phase 3 — Multi-agent + public release
- [ ] Codex adapter (verify against live CLI)
- [ ] Freebuff adapter (contribute upstream if needed)
- [ ] Apple Developer ID + first notarization pass
- [ ] Auto-update channel (electron-updater)
- [ ] Public landing at idex.dev
- [ ] Twitter/X launch tweet 🚀

## 💰 v1.1 — Monetization on
- [ ] Wire trygravity.ai SDK into card list (positions 4 + 9)
- [ ] Apply for trygravity.ai publisher status
- [ ] Settings toggle to disable ads (with a polite explainer)
- [ ] Opt-in telemetry to tune curator quality
- [ ] First user thumbs-up/down feedback loop

## 🧠 v1.2 — Smarter curator
- [ ] Reddit + YouTube as additional feed sources
- [ ] Per-tweet GLM re-ranking pass
- [ ] User-controlled topic boosts ("more like this", "less like this")
- [ ] Save card to "Read later"
- [ ] Notion/Linear/Slack share targets

## 🌍 v2 — Beyond macOS
- [ ] Linux build
- [ ] Windows build
- [ ] Multi-tab sessions (one tab per project)
- [ ] BYO agent SDK (plugin per CLI)
- [ ] Mobile companion (iOS, Android — picture-in-picture mode)
- [ ] Self-hosted curator (run GLM locally via Ollama)

---

Want to push something on this list forward? See [CONTRIBUTING.md](./CONTRIBUTING.md).
