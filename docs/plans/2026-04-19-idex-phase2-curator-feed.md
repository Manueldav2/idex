# IDEX Phase 2 — Real Curator + Composio Feed

> **Goal:** Make the feed actually pull live, contextual content from X via Composio, ranked by GLM-4.6.

## What lands in Phase 2

The user prompts the agent → curator hits GLM-4.6 → Composio searches X → cards stream into the feed pane. End-to-end, no mocks.

## Tasks

### Task P2-1: OpenRouter client in `packages/curator`

**Files:**
- Create: `packages/curator/src/openrouter.ts`
- Modify: `packages/curator/src/curator.ts`
- Modify: `packages/curator/package.json` (add `openai` dependency, OpenRouter is OpenAI-compatible)

**Steps:**
- [ ] Add `openai` dependency
- [ ] Implement `callGLM46(prompt, schema)` that wraps `openai` SDK pointed at OpenRouter base URL `https://openrouter.ai/api/v1`
- [ ] Use response_format `{ type: "json_schema", schema: <CuratorPlan schema> }` for structured output
- [ ] Add a 5s timeout; on timeout, fall back to `planFromContext` (deterministic v1.0 path)
- [ ] Replace deterministic `planFromContext` calls in `curate()` with the LLM call when an `OPENROUTER_API_KEY` is provided

**Why this design:** The curator can degrade gracefully — if no key, no LLM, no problem. Starter feed still lights up.

### Task P2-2: Composio Twitter REST client

**Files:**
- Create: `packages/curator/src/composio.ts`

**Steps:**
- [ ] Add a small `fetch` wrapper for Composio's REST API (`https://backend.composio.dev/api/v3`)
- [ ] Implement `searchTweets({ connectedAccountId, query, maxResults })` that POSTs to `/actions/TWITTER_SEARCH_TWEETS/execute`
- [ ] Map Composio's response into our `Card` shape (use `oembed` if Composio returns it, else build `fallback`)
- [ ] Implement token-bucket rate limiting (300/15min per user)
- [ ] Implement stale-while-revalidate cache (15-min TTL keyed on query)

### Task P2-3: Composio OAuth flow in `apps/desktop`

**Files:**
- Create: `apps/desktop/electron/composio-oauth.ts`
- Modify: `apps/desktop/electron/main.ts` (register IPC channels)
- Modify: `apps/desktop/src/components/Setup.tsx` (add Connect X step)

**Steps:**
- [ ] Add `connectX` and `composioStatus` IPC channels
- [ ] `connectX` POSTs to `/api/v3/connected_accounts` → opens returned `redirectUrl` via `shell.openExternal`
- [ ] Poll `/api/v3/connected_accounts/{id}` every 2s for up to 5 min until `status === "ACTIVE"`
- [ ] Persist `connectedAccountId` to AppConfig
- [ ] Add a "Connect X (optional)" step to Setup; allow skip → starter feed only

### Task P2-4: Wire real curator into Feed store

**Files:**
- Modify: `apps/desktop/src/store/feed.ts`
- Modify: `packages/curator/src/index.ts`

**Steps:**
- [ ] Refactor `useFeed.refresh()` to call an async `curateFeed()` that:
   - Reads OpenRouter + Composio credentials from keychain
   - If both present: call GLM-4.6 → Composio search → hydrate Cards
   - If only Composio: extract topics deterministically → Composio search
   - If neither: return starter feed (current behavior)
- [ ] Show a small "curating…" indicator in the feed pane while in flight
- [ ] On error, fall back to starter feed without breaking the UI

### Task P2-5: Twitter oEmbed renderer

**Files:**
- Modify: `apps/desktop/src/components/Card.tsx`

**Steps:**
- [ ] If `card.oembed?.html` is present, render it inside a sandboxed iframe with `srcdoc` containing the oEmbed HTML + Twitter widgets.js
- [ ] Fallback to existing structured render if oEmbed is null or fails to load
- [ ] Whitelist `platform.twitter.com` in the CSP

### Task P2-6: Adapter test fixtures

**Files:**
- Create: `packages/adapters/__fixtures__/claude-code-prompt-001.txt`
- Create: `packages/adapters/__tests__/claude-code.test.ts`
- Modify: `packages/adapters/package.json` (add vitest)

**Steps:**
- [ ] Capture 5–10 real Claude Code stdout snapshots into fixtures
- [ ] Write vitest assertions on `detect()` behavior per fixture
- [ ] Add `pnpm test` script

### Task P2-7: Settings panel

**Files:**
- Create: `apps/desktop/src/components/Settings.tsx`
- Modify: `apps/desktop/src/components/Cockpit.tsx` (add settings icon)

**Steps:**
- [ ] Settings drawer with: agent picker, OpenRouter key, Composio status, curator toggle, ads toggle, autoscroll seconds
- [ ] Settings persists immediately via `useSettings.patch()`
- [ ] "Privacy panic mode" prominent toggle — disables curator entirely

### Task P2-8: Telemetry (opt-in)

**Files:**
- Create: `packages/curator/src/telemetry.ts`
- Modify: `apps/desktop/src/store/feed.ts`

**Steps:**
- [ ] If user opts in (Settings checkbox), POST anonymized `{ topicHash, cardId, action: "shown" | "thumbsUp" | "thumbsDown" }` to a TBD endpoint
- [ ] No PII, no prompts, no code

## Out of Phase 2

- Codex and Freebuff adapters (Phase 3)
- Mac notarization (Phase 3)
- Trygravity.ai ad slots (v1.1)
- Reddit/YouTube feed sources (v1.2)

## Definition of done

- [ ] `pnpm dev:desktop` launches; pick Claude Code; type "fix my SPF" → real X tweets about SPF/DKIM stream into the feed
- [ ] Disable curator in Settings → starter feed still shows
- [ ] Disconnect X → curator falls back to keyword-only feed
- [ ] All workflows passing on CI
