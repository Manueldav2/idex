# Contributing to IDEX

Thanks for considering a contribution! IDEX is MIT-licensed and aims to be a friendly, low-ceremony project to hack on.

## Getting started

```bash
git clone https://github.com/Manueldav2/idex.git
cd idex
pnpm install
```

### Run the desktop app in dev mode

```bash
pnpm dev:desktop
```

This launches the Electron window with hot-reload for both the renderer and the main process.

### Run the landing site in dev mode

```bash
pnpm dev:landing
```

Visit http://localhost:5180.

## Repo layout

```
apps/
  desktop/         Electron + React + Vite (the cockpit)
  landing/         Vite + React (the marketing site)
packages/
  types/           Shared TypeScript contracts
  adapters/        Per-CLI agent adapters
  curator/         Feed curator (deterministic v1.0; LLM in Phase 2)
docs/
  specs/           Design specifications
  plans/           Implementation plans
references/
  ui/              Reference component sources (21st.dev / Aceternity)
```

## Where to start

Look for issues labeled `good-first-issue` or pick from the [Roadmap](./ROADMAP.md):

- **Phase 2:** Real Curator (GLM-4.6 via OpenRouter) + Composio Twitter integration
- **Phase 3:** Codex + Freebuff agent adapters · Mac notarization
- **v1.1:** Trygravity.ai ad slots · telemetry-tuned curator

## Code conventions

- TypeScript everywhere. No `any` unless you justify it in a comment.
- Tailwind v4 for styling. Use design tokens (`--color-ink-*`, `--color-accent`, etc.) rather than raw hex.
- Animations follow [Emil Kowalski's principles](https://animations.dev/) — see the spec for our motion table.
- One responsibility per file. Prefer small focused files over large omnibus ones.
- Commit messages: `<scope>: <change>` lowercase, imperative. PR titles matter.

## Pull request process

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-thing`
3. Make your changes
4. `pnpm -r typecheck` must pass
5. Push and open a PR
6. Reference any related issue

## Reporting bugs

Open an issue with:
- Your OS + arch (e.g. `macOS 14.5 / Apple Silicon`)
- IDEX version (`About → IDEX`)
- Steps to reproduce
- What you expected vs. what happened

## License

By contributing, you agree your contributions are licensed under MIT.
