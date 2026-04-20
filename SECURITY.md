# Security Policy

## Supported versions

IDEX is in pre-1.0. Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Email: **info@devvcore.com** with subject `[IDEX SECURITY]`.

Include:
- Affected version
- Reproduction steps
- Impact assessment
- Suggested fix (optional)

We aim to respond within 72 hours and release a patch within 14 days for critical issues.

## Threat model

IDEX runs locally on your Mac. Out of scope for this threat model:

- Compromise of the agent CLI you choose (Claude Code, Codex, Freebuff)
- Compromise of OpenRouter, Composio, or any user-configured LLM provider
- Physical access to the machine

In scope:

- Code execution from the IDEX renderer process (we sandbox via Electron `contextIsolation`)
- Leakage of API keys from OS keychain (we use `keytar`; never log keys)
- IPC channel abuse (all channels are typed and validated in `electron/main.ts`)
- CSP escape in the renderer (CSP is configured in `apps/desktop/index.html`)

## Disclosure

Coordinated disclosure: we'll work with you on a public advisory once the patch is released.
