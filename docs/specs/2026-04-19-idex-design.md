# IDEX — Interactive Dev Experience

**Status:** Draft v1 (design phase)
**Date:** 2026-04-19
**Owner:** Manny (info@devvcore.com)
**Type:** Product + technical design specification

---

## 1. Problem & vision

### Problem

When a developer prompts a coding agent (Claude Code, Codex, Freebuff), they wait between 5 and 60 seconds for the response. During that wait they almost universally context-switch to Twitter/X, Discord, YouTube, or a browser tab — losing focus and rarely returning with information that's relevant to what they were working on.

The wait is wasted twice: it produces no useful information, and it usually breaks flow.

### Vision

**IDEX intercepts the wait.** While the agent is generating, IDEX foregrounds a TikTok-energy, picture-to-picture scroll feed of media (videos, images, threads from X) that is *contextually relevant* to what the developer just asked the agent to do. When the agent finishes, the cockpit reclaims the main screen and the feed retreats to a peek strip on the edge.

Examples of the contextual prediction the feed must do:
- User is debugging a cold-email pipeline → feed surfaces deliverability tips, SPF/DKIM walkthroughs, IP-warming threads, name-server config gotchas.
- User is wiring up Stripe webhooks → feed surfaces idempotency patterns, signature-verification footguns, sandbox-vs-prod horror stories.
- User is shipping a Tauri app → feed surfaces v2 migration notes, code-signing tips on macOS, bundle-size memes.

### Why now

- Coding-agent wait time is the single most under-monetized attention surface in dev tooling (everyone else is chasing the agent itself).
- Composio + X + LLM curation is now cheap and reliable enough to render a useful feed within the typical 5-30s agent generation window. Target: curator returns top 15 cards within **~1.5s p50, ~3s p95**. If the curator misses the window, IDEX shows cached/popular fallback cards from a local rotation.
- An ad-supported dev tool is feasible because **trygravity.ai** (already adopted by BetterBot in production) is a contextual ad network purpose-built for AI surfaces — zero-latency, native-feeling.

### Non-goals (v1)

- Build our own coding agent. (We host Claude Code, Codex, Freebuff.)
- Be a general-purpose browser like Comet. (We're a Chromium-shelled cockpit, not a Chrome replacement.)
- Mobile, multi-tab, multi-project sessions, BYO-agent plugin SDK.

---

## 2. V1 product spec (one-page summary)

| Decision | Value |
|---|---|
| Form factor | Electron (Chromium) + React 19 + Vite + TypeScript desktop app, macOS first |
| Hosted agents | Claude Code, Codex, Freebuff — user picks one per session |
| Context capture | App owns the agent subprocess via `node-pty` and intercepts the I/O stream — no hooks needed |
| Curator brain | **GLM-4.6** via OpenRouter (open-weight, ~$0.55/M input tokens, structured-output capable) |
| Feed source | X/Twitter via **Composio MCP** (OAuth2, user signs in once on first run) |
| Feed format | Full multimedia — video, image, carousel, polls. Rendered via official Twitter embed widget wrapped in our card chrome. |
| Layout | Cockpit (main) + feed (peek strip). On agent generation: feed expands to ~70%; on agent done: cockpit reclaims. |
| Color palette | `--ink-0 #0A0B0E`, `--ink-1 #13151B`, `--ink-2 #1C1F28`, `--line #22252F`, `--text-primary #F2F4F7`, `--text-secondary #8B92A5`, `--accent #3D7BFF` |
| Typography | Inter (UI/display), JetBrains Mono (terminal/code), `font-variant-numeric: tabular-nums` for all numbers |
| Conversation surface | No bubbles, no avatars. `>` prefix for user, full-width mono for agent (moda.dev pattern). |
| Monetization | trygravity.ai contextual ads, slotted into feed at positions 4 and 9. **Wired in v1.0 behind a feature flag (default OFF); enabled in v1.1 once user base + Gravity approval lands.** |
| License | MIT, OSS, repo at `github.com/devvcore/idex` (TBD) |

---

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  IDEX Electron App                                              │
│  ┌──────────────────────────┐  ┌────────────────────────────┐   │
│  │  Main Process (Node)     │  │  Renderer (React + Vite)   │   │
│  │  ─ Window mgmt           │◀▶│  ─ Cockpit pane            │   │
│  │  ─ Agent subprocess host │  │  ─ Feed pane               │   │
│  │    (node-pty)            │  │  ─ Setup/onboarding        │   │
│  │  ─ Keychain (Keytar)     │  │  ─ Settings                │   │
│  │  ─ HTTP service for      │  │                            │   │
│  │    Curator + Composio    │  │                            │   │
│  └──────────────┬───────────┘  └─────────────┬──────────────┘   │
│                 │  IPC (typed channels)      │                  │
│                 └────────────┬───────────────┘                  │
│                              ▼                                  │
│                     ┌──────────────────┐                        │
│                     │  Context Bus     │                        │
│                     │  (single source  │                        │
│                     │  of agent state) │                        │
│                     └────┬────────┬────┘                        │
│                          │        │                             │
│              ┌───────────┘        └────────────┐                │
│              ▼                                 ▼                │
│   ┌──────────────────┐            ┌──────────────────────┐      │
│   │  Curator Service │            │  Feed Pane           │      │
│   │  (renderer)      │            │  (renderer)          │      │
│   │  ─ Topic extract │            │  ─ Picture-to-pic    │      │
│   │  ─ Adjacency exp │            │  ─ Snap scroll       │      │
│   │  ─ Query gen     │            │  ─ Mode-switch       │      │
│   │  ─ Rank + dedupe │            │    peek↔expanded     │      │
│   └────────┬─────────┘            └──────────▲───────────┘      │
│            │                                 │                  │
│            ▼                                 │                  │
│   ┌──────────────────┐            ┌──────────────────────┐      │
│   │  Main HTTP svc   │            │                      │      │
│   │  ─ GLM-4.6       │            │                      │      │
│   │    (OpenRouter)  │            │                      │      │
│   │  ─ Composio MCP  │            │                      │      │
│   │  ─ Twitter oEmbed│            │                      │      │
│   └──────────────────┘            └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3.5 Repo layout (monorepo, pnpm workspaces)

```
idex/
├── apps/
│   ├── desktop/              # Electron app (main + renderer)
│   │   ├── electron/         # Main process source
│   │   ├── src/              # Renderer (React)
│   │   ├── package.json
│   │   └── electron-builder.json
│   └── landing/              # Landing site (Vite + React)
│       ├── src/
│       ├── components/ui/    # 21st.dev / Aceternity copies
│       └── package.json
├── packages/
│   ├── types/                # Shared TS types (IPC, Card, ContextEvent)
│   ├── adapters/             # Agent CLI adapters (Claude Code, Codex, Freebuff)
│   └── curator/              # Curator pipeline (LLM call + ranking)
├── docs/
│   ├── specs/                # Design specs
│   └── plans/                # Implementation plans
├── references/               # Reference UI components, sample data
│   └── ui/
├── package.json              # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

User config and secrets live OUTSIDE the repo:
- `~/.idex/config.json` — non-secret settings + `connectedAccountId`
- OS keychain (via `keytar`) — `composioApiKey`, `openRouterApiKey`

---

## 4. Components

### 4.1 Electron Shell

- **Main process** (Node.js): window management, IPC bus, agent subprocess lifecycle, OS keychain access, HTTP service for Curator + Composio.
- **Renderer** (React 19 + Vite + Tailwind 4 + TypeScript): all UI. Two routes: `/setup` (first-run) and `/cockpit` (main app).
- **IPC channels** (typed via shared `types/ipc.ts`):
  - `agent:spawn` → `{ agentId: "claude-code" | "codex" | "freebuff", cwd: string }`
  - `agent:input` → `{ text: string }`
  - `agent:output:stream` → `{ chunk: string }`  (renderer subscribes)
  - `agent:state` → `{ state: "idle" | "generating" | "done" | "error" }`
  - `context:event` → `{ kind: "user_input" | "agent_chunk" | "agent_done", text: string, ts: number }`
  - `feed:cards` → `{ cards: Card[] }`
  - `feed:state` → `{ state: "peek" | "expanded" | "transitioning" }`

### 4.2 Agent Host

- Wraps `node-pty` to spawn the chosen agent CLI as a subprocess in a real TTY (preserves colors, spinners, raw mode).
- Three thin adapters (one per CLI) implement a common interface:
  ```ts
  interface AgentAdapter {
    detectUserPromptBoundary(stream: string): boolean;
    detectAgentDoneBoundary(stream: string): boolean;
    extractCleanText(stream: string): string;  // strip ANSI, normalize markdown
  }
  ```
- v1 detection strategy: regex on each adapter's known prompt markers + 300ms idle-timeout fallback.

#### 4.2.1 Adapter — Claude Code
- Prompt marker: `^>` at line start after `"Claude Code"` banner.
- Done marker: end of streamed text + 300ms idle.

#### 4.2.2 Adapter — Codex
- Prompt marker: `^codex>` at line start.
- Done marker: streamed JSON event `"event":"done"` OR 300ms idle.

#### 4.2.3 Adapter — Freebuff
- Prompt marker: `^freebuff>` at line start (verify against actual Freebuff CLI output).
- Done marker: 300ms idle (Freebuff doesn't emit a structured done event as of inspection).

### 4.3 Context Bus

- In-renderer EventEmitter, single source of truth for agent state.
- Subscribers: Cockpit pane (renders terminal), Curator service (generates feed), Feed pane (mode-switch peek↔expanded).
- Events conform to `ContextEvent` discriminated union in `types/context.ts`.

### 4.4 Curator Service

- Long-lived in renderer; offloads model calls to the main-process HTTP service.
- **Pipeline triggered on every `user_input` event:**

```
1. SUMMARIZE        → 1-2 sentence project context from last N=6 turns
2. INTENT EXTRACT   → "what is the user building / debugging / learning?"
3. ADJACENCY EXPAND → list 5-10 tangentially-relevant topics
4. QUERY GEN        → 5-10 X search queries (mix of direct + adjacent)
5. FETCH            → parallel Composio Twitter MCP `search_tweets` calls
6. DEDUPE + RANK    → drop duplicates; score by 0.5*relevance + 0.3*recency + 0.2*engagement
7. PUSH             → top 15 → Feed Pane via `feed:cards` event
```

Steps 1-4 = single GLM-4.6 call with structured output schema. Steps 5-7 = deterministic Node.

#### 4.4.1 Curator prompt (GLM-4.6 single call, structured output)

```
SYSTEM:
You are the IDEX curator. Given a coding-agent conversation, output a JSON object that helps select tweets the developer would find relevant or entertaining while their agent is generating.

USER:
RECENT CONVERSATION (last 6 turns):
<turns>

CURRENT PROMPT:
<the latest user input>

Output JSON matching this schema:
{
  "summary": string,                        // 1-2 sentences
  "intent": string,                         // what user is building/debugging/learning
  "direct_topics": string[],                // 3-5 topics directly named
  "adjacent_topics": string[],              // 5-10 tangentially relevant topics
  "x_queries": string[]                     // 5-10 X search queries, ranked best-first
}
```

### 4.5 Feed Pane

React component. Three visual modes driven by `feed:state`:
- `peek` — 80px right-edge strip, blurred preview of the next card, subtle `--accent-glow` pulse.
- `expanded` — feed takes ~70% of screen, vertical card-per-screen snap-scroll, autoscroll every 4s, manual scroll wins.
- `transitioning` — 250-280ms spring from peek→expanded, 200-220ms back.

Card structure:
- Top border-edge highlight (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.04)`)
- Wrapped Twitter embed widget (oEmbed) — gives us video, carousel, polls free
- Top-right: `↗ open in X` chip
- Bottom: 11px `--text-secondary` relevance chip — e.g. *"Why you're seeing this: deliverability is critical for cold email systems."*

### 4.5.1 Card data model

```ts
interface Card {
  id: string;                        // tweet ID, used as React key
  source: "twitter" | "starter";     // "starter" = no-X fallback feed
  url: string;                       // tweet permalink (open-in-X target)
  oembed: {                          // primary renderer (Twitter widgets.js)
    html: string;
    width?: number;
    height?: number;
  } | null;                          // null → use fallback renderer below
  fallback?: {                       // used if oEmbed unavailable / blocked
    text: string;
    media?: Array<{ kind: "image" | "video"; url: string; alt?: string }>;
    author: { name: string; handle: string; avatarUrl?: string };
    createdAt: string;               // ISO 8601
  };
  relevanceReason: string;           // 1-line "Why you're seeing this"
  score: number;                     // 0..1, ranking signal
  fetchedAt: number;                 // ms epoch, for cache TTL
  isAd?: boolean;                    // true → render with Gravity ad chrome
}
```

The renderer prefers `oembed.html` (Twitter widgets.js iframe). If `oembed === null` (Twitter widget blocked by CSP or rate-limit), it falls back to the structured `fallback` field rendered with our own card chrome.

### 4.6 Composio Integration

- **OAuth flow:** First run → user clicks **Connect X** → IDEX calls Composio's `POST /api/v3/connected_accounts` to initiate, opens the returned `redirectUrl` (Composio's hosted authorization portal) in the default browser → user authorizes on X → Composio stores the OAuth token server-side and the user is shown a "you can close this tab" confirmation → IDEX polls `GET /api/v3/connected_accounts/{id}` until `status === "ACTIVE"` → stores the `connectedAccountId` (a non-secret reference) in `~/.idex/config.json`.
- **No deep-link required for v1** — polling avoids the `idex://` protocol-registration race and works in dev (multiple installs).
- **Runtime:** Curator service calls Composio's REST tool-execution API at `POST https://backend.composio.dev/api/v3/actions/TWITTER_SEARCH_TWEETS/execute` with `X-API-Key` header (Composio API key from keychain) and body `{ "connectedAccountId": "<id>", "input": { "query": "<x search>", "max_results": 10 } }`. We are NOT running an MCP client; Composio's REST API is simpler and lower-latency for server-to-server use.
- **No-X fallback:** Users who skip the X connection get a curated "starter feed" — ~200 evergreen dev tweets shipped as JSON in the app — keyword-matched against curator topics. Reduces setup friction (R3 mitigation).
- **Rate-limit handling:** token-bucket per-user (300 calls/15min, mirrors Composio's default), stale-while-revalidate cache (15-min TTL keyed on the query string).
- **API tier note:** Composio fronts the X API on its side; we don't manage X API tier directly. As of 2026-04, Composio's free tier covers ~500 actions/day, enough for ~30 prompts/day per user. Heavy users may need to upgrade Composio.

### 4.7 Settings & Auth

- Tiny zustand store. Persists to `~/.idex/config.json`:
  ```json
  {
    "selectedAgent": "claude-code" | "codex" | "freebuff",
    "agentBinaryPath": "/usr/local/bin/claude",
    "feedEnabled": true,
    "autoscrollSeconds": 4,
    "version": "0.1.0"
  }
  ```
- Secrets in OS keychain (Keytar), never in config file:
  - `composioApiKey`
  - `xOauthToken`
  - `openRouterApiKey` (for GLM-4.6)

---

## 5. Event lifecycle (one round-trip)

```
T+0ms     User types "fix my SPF record so emails stop bouncing" + presses Enter
T+1ms     Cockpit emits ipc(agent:input, text)
T+2ms     Cockpit emits ipc(context:event, kind=user_input)
T+3ms     Main writes text to PTY → agent process receives
T+5ms     Curator service consumes context:event →
           → Calls main-process /curate endpoint
T+10ms    Feed Pane receives ipc(feed:state, state=expanded) → begins peek→expanded transition (280ms)
T+50ms    Agent emits first stdout chunk → Adapter.detectUserPromptBoundary returns false
           → Cockpit renders chunk via xterm.js
T+200ms   GLM-4.6 returns curator JSON (5 queries)
T+220ms   Composio MCP fires 5 parallel search_tweets calls
T+800ms   All MCP responses returned. Dedupe + rank.
T+820ms   Top 15 cards pushed via ipc(feed:cards) → Feed Pane begins staggered card entry
           (50ms between cards, 200ms each)
T+820...  User scrolls feed while agent continues to generate
T+12000ms Agent emits done sentinel → Adapter detects boundary
           OR 300ms idle from last chunk → Adapter detects boundary
T+12001ms ipc(agent:state, state=done) → Feed Pane begins expanded→peek (220ms two-phase
           swap with blur, per Emil)
T+12300ms Cockpit reclaims main screen with full agent reply rendered
```

---

## 6. Motion & feel (Emil Kowalski principles)

| Surface | Easing | Duration | Notes |
|---|---|---|---|
| peek → expanded | `cubic-bezier(0.32, 0.72, 0, 1)` (iOS drawer) | 280ms | CSS transition on `width` + `transform`. Interruptible. |
| expanded → peek | same | 220ms | Exit faster than enter (Emil). Two-phase: feed shrinks + blur(2px), cockpit fades from opacity 0.7→1, phases overlap by 50ms. |
| Card entry | `cubic-bezier(0.23, 1, 0.32, 1)` ease-out | 200ms each | 50ms stagger between cards. opacity 0→1, translateY 8px→0. Transition not keyframe (retargetable on new fetches). |
| Cockpit↔feed swap | `cubic-bezier(0.77, 0, 0.175, 1)` ease-in-out | 300ms total | Two-phase blur swap masks the imperfect crossfade (Emil: blur bridges visual gap). |
| Button press | ease-out `cubic-bezier(0.23, 1, 0.32, 1)` | 160ms | `transform: scale(0.97)` on `:active`. All pressable elements. |
| Tooltip | ease-out | 125ms | scale 0.97→1, opacity 0→1, transform-origin from trigger. **Skip animation on subsequent tooltips** in same group. |
| Streaming caret | n/a | 1.06s blink | Slightly off from default 1s, "feels alive." |
| Agent picker dropdown | ease-out (custom) | 180ms | scale 0.95→1, opacity 0→1, transform-origin from trigger. Modals are exempt — keep transform-origin: center. |

### What does NOT animate

| Action | Why |
|---|---|
| Send prompt (Enter key) | Keyboard-initiated, ~50-100×/session — instant only |
| Mute toggle on video card (M key) | Keyboard action |
| Mode chevron snap (peek/expand handle) | Decorative noise — snaps |

### prefers-reduced-motion: reduce

- Drop all `translate` and `scale` movement.
- Keep opacity transitions for state legibility.
- Replace blur swap with instant crossfade.

---

## 7. Visual language

### Color tokens (CSS custom props on `:root`)

```css
:root {
  --ink-0: #0A0B0E;
  --ink-1: #13151B;
  --ink-2: #1C1F28;
  --line: #22252F;
  --text-primary: #F2F4F7;
  --text-secondary: #8B92A5;
  --accent: #3D7BFF;
  --accent-soft: #3D7BFF20;     /* 12% alpha */
  --accent-glow: #3D7BFF40;     /* 25% alpha */
  --error: #FF6B6B;             /* used sparingly */
}
```

No greens, no warm grays. Single accent = blue. **Glassmorphism is in** — see §7.5 for usage rules.

### 7.5 Glassmorphism (Paradigm Outreach reference)

Glass surfaces are used **selectively** — never as wallpaper. Three legitimate uses in v1:

1. **Cockpit header bar** — sticky 56px header with `backdrop-filter: blur(24px) saturate(180%)`, background `rgba(19, 21, 27, 0.65)`, bottom border `1px solid var(--line)`. Provides the "floating chrome" feel without losing legibility.
2. **Feed expanded-state edge fade** — top and bottom 80px of the feed pane have a **vertical gradient mask only (no blur)** so cards fade out at the edges instead of being hard-clipped. Backdrop blur is reserved for chrome (header, modals) — never over the scrolling card list, which would hurt readability.
3. **Card hover overlay (post-MVP)** — on `:hover` of a card, a thin glass overlay slides up from the bottom revealing actions (`Save`, `Open in X`, `Hide topic`).

#### Glass token

```css
:root {
  --glass-bg: rgba(19, 21, 27, 0.65);          /* --ink-1 at 65% */
  --glass-border: rgba(255, 255, 255, 0.06);   /* hairline highlight */
  --glass-blur: blur(24px) saturate(180%);
}

.glass {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
}
```

#### Glass anti-rules

- **Never** apply glass to text-heavy surfaces (cockpit transcript, feed card body) — kills legibility.
- **Never** use glass + glass adjacent (no nested glass cards).
- Glass MUST sit on top of a textured backdrop (cards, gradient, video) for the effect to read. Solid `--ink-0` behind glass = invisible.

### Typography

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Display | Inter | 800 | clamp(48px, 7vw, 96px) | tracking `-0.03em` |
| Section header (landing) | Inter | 700 | clamp(28px, 3.5vw, 44px) | tracking `-0.02em` |
| App headline | Inter | 600 | 18px | |
| UI body / labels | Inter | 500 | 13px | |
| Buttons | Inter | 600 | 13px | |
| Agent terminal output | JetBrains Mono | 400 | 13px / 18px line-height | |
| Code blocks in cards | JetBrains Mono | 400 | 12px | |
| Numbers (timestamps, counts) | Inter | 500, `tabular-nums` | matches context |  |

### Surfaces

- App background: `--ink-0`
- Cockpit pane: `--ink-1` with right-edge 1px `--line` border when feed peek visible
- Feed pane: `--ink-0` (same as bg — feels like content "comes from outside")
- Cards: `--ink-1`, 12px radius, 1px `--line` border, top-edge highlight
- Code blocks: `--ink-2`, 8px radius, language chip top-right, copy on hover

---

## 8. Cockpit conversation surface (moda.dev pattern)

- **No avatars, no message bubbles.** Inspired by moda.dev's developer-first chat treatment.
- **User input** rendered left-aligned, prefixed with `›` glyph in `--accent`, body text in `--text-primary` Inter 500.
- **Agent reply** full-width, JetBrains Mono 13px / 18px line height, `--text-primary`. Code blocks in `--ink-2` with language chip.
- **Agent attribution** appears once per turn as a small `--text-secondary` label above the first message: `Claude Code · 2:41:03 PM`. Never repeated mid-turn.
- **Streaming caret** — 1px blue caret blinking at 1.06s. Token arrival is instant (no per-token animation).
- **Code copy button** appears on `:hover` of code block, top-right, ghost button.
- **ASCII logo** at top of cockpit pane, custom IDEX glyph, `--text-secondary`:
  ```
   ▐▛███▜▌
  ▝▜█████▛▘
    ▘▘ ▝▝
  ```
- **Header chip** below logo: `Claude Code · ~/cold-email-infra · sonnet-4.6` then `v0.1.0` chip in `--accent-soft`.

---

## 9. Feed pane behavior

- **Peek state** — 80px wide right-edge strip. Always visible when `feedEnabled`. Shows blurred preview of next card with `filter: blur(8px)`, brightness lowered. Subtle `--accent-glow` pulse animation (3s cycle).
- **Expanded state** — pane animates to ~70% width. Cards stack vertically, one per viewport-height with `scroll-snap-type: y mandatory`. Autoscroll every 4s; any manual scroll cancels autoscroll for the duration of `expanded`.
- **Card focus** — focused card gets thin `--accent-glow` outline (1px). Unfocused cards dim to 70% brightness.
- **Tap card to fullscreen** (post-MVP) — opens card in a modal viewer.
- **"Open in X"** chip top-right of card, opens tweet in default browser.
- **Relevance chip** bottom of card, 11px, `--text-secondary`, italic. Curator-provided one-liner explaining why this card was selected.

---

## 10. Landing page structure (modeled on betterbotagent.com)

Single-page React + Vite (separate from the Electron app), deployed to `idex.dev` (TBD). All sections share dark theme with our token palette.

| # | Section | Content | Visual |
|---|---|---|---|
| 1 | Sticky nav | Logo, (Features, How It Works, FAQ, GitHub), Download CTA | **Glass header** — `backdrop-filter: blur(24px) saturate(180%)`, `rgba(10, 11, 14, 0.7)` background, bottom `1px --line` divider, 64px tall |
| 2 | Hero | Headline: **"Code while you scroll."** Subhead: *"The IDE that watches the wait."* CTAs: solid blue Download for Mac (free), ghost View on GitHub | **Scroll-triggered 3D device reveal** using 21st.dev / Aceternity's `ContainerScroll` component (saved to `references/ui/container-scroll-animation.tsx`). Card starts rotated 20° on the X-axis at scale 1.05, settles to 0° at scale 1.0 as the user scrolls. Inside the card: looping 12s product demo video (silent autoplay) showing cursor types prompt → feed slides in from right → user scrolls cards → claude-done → cockpit reclaims. Card chrome uses our `--ink-2` background with a `--line` border and the multi-layer drop-shadow stack from the reference component. |
| 3 | "Wait time becomes scroll time" | Pitch the core feature | Animated mock of peek→expand transition |
| 4 | "Three agents, one cockpit" | Agent picker UI | Mock showing Claude Code / Codex / Freebuff radio cards |
| 5 | "Your conversation curates the feed" | Diagram showing prompt → curator → X queries → cards | Real example: cold email prompt → deliverability tweets |
| 6 | "Always relevant, never noisy" | Why curation > algorithmic | Two-tone heading: `Always relevant.` `Never noisy.` |
| 7 | "Free, open source, ad-supported" | Position vs Cursor / Continue / etc | GitHub star count, Gravity Ads chip |
| 8 | FAQ | Accordion: What is IDEX? / How does the feed work? / Is my code private? / etc. | Standard accordion |
| 9 | Final CTA | "Ready to make the wait worth it?" | Solid blue button, mac-only callout |
| 10 | Footer | Logo, 4 links, copyright | Minimal |

Section headers use the moda.dev two-tone pattern: `<span class="text-primary">First phrase.</span> <span class="text-secondary">Second phrase.</span>`

---

## 11. First-run / setup flow

```
1. App opens → /setup route
2. Step 1 — Welcome screen with IDEX ASCII logo + "Let's pick your agent."
3. Step 2 — Agent picker: 3 cards (Claude Code, Codex, Freebuff). User picks one.
            App auto-detects binary path; shows green check or "not installed."
            If not installed: shows install command + copy button.
4. Step 3 — Curator API key: paste OpenRouter key (with link to get one).
            Stored in keychain.
5. Step 4 — Connect X: button opens Composio OAuth in default browser.
            Browser → redirects to idex://oauth/callback → app catches deep link.
            Token stored in keychain.
6. Step 5 — "You're all set" → → → /cockpit
```

Setup is skippable per-step (user can start with no feed and configure later).

---

## 12. V1 in-scope / out-of-scope

| In | Out |
|---|---|
| macOS first (Apple Silicon + Intel) | Windows, Linux |
| Bundled support for 3 agents | BYO agent SDK |
| X/Twitter via Composio | Reddit, YouTube, our own image library |
| Full multimedia feed via Twitter embed widget | Custom card renderer |
| GLM-4.6 via OpenRouter | Local Ollama support |
| Single-window, single-session | Multi-tab / multi-project |
| User logs into X once via Composio OAuth | Multi-account |
| Open source MIT, BYO API keys | Hosted/free-tier |
| Trygravity.ai ads enabled by default | (feature-flagged in code v1.0, OFF until v1.1) |
| Manual scroll + 4s autoscroll | Gesture controls (swipe, double-tap) |

---

## 13. Open questions / risks

| # | Question / risk | Mitigation |
|---|---|---|
| Q1 | Does Freebuff expose a clean done-event boundary, or do we need 300ms idle fallback only? | Inspect `freebuff` CLI output during Phase 2; contribute upstream if needed |
| Q2 | Composio rate limits per user — 300/15min enough? | Stale-while-revalidate cache + token-bucket; batch-fetch 15 cards once vs streaming |
| Q3 | GLM-4.6 p95 latency target ~3s — needs benchmark | Benchmark in Phase 2 milestone; fallback path → Gemini 3 Flash Lite via OpenRouter if too slow. While slow, show starter-feed cards. |
| Q4 | OpenRouter key requirement during setup gates adoption | Ship with starter-feed mode that works WITHOUT a key; surface "Connect for smarter feed" CTA in cockpit |
| Q5 | Per-tweet `relevance` score in ranking — how computed? | v1: Composio's native search-relevance score (returned in MCP response) + recency. v1.1: optional second GLM pass for re-rank. |
| R1 | Twitter/X may block embedded oEmbed inside Electron CSP | Card data model (§4.5.1) supports an explicit `fallback` renderer using direct media URLs from Composio. CSP allowlists `*.twitter.com`. |
| R2 | Some agent CLIs may print prompts in a non-detectable way | Multiple detection heuristics + idle-timeout fallback + per-adapter test fixtures captured from real CLI runs |
| R3 | trygravity.ai may not approve a brand-new dev tool with no traffic at launch | v1.0 ships with ads feature-flagged OFF; ad slots present but disabled until approval |
| R4 | Devs hate ads → backlash if poorly placed | Feed-only ads, never agent-output-adjacent; transparent settings toggle |
| R5 | Curator hallucinates irrelevant queries → bad feed → uninstall | Thumbs-up/down on cards; opt-in telemetry to tune prompt over time |
| R6 | Apple Gatekeeper / notarization adds days to first release | Apply for Apple Developer ID **before** Phase 3; budget 5 days for first notarization pass |
| R7 | Coding-agent CLI output formats drift between versions (Claude Code shipped 5+ TUI revisions in 2025) | Pin tested versions in `package.json` engines field; CI fixture-compare against live CLI weekly |
| R8 | Forwarding user prompts (which may include proprietary code) to OpenRouter + Composio creates legal exposure | Mandatory in-app disclosure on first run before any prompt is sent: "Your prompts and feed queries are sent to OpenRouter (GLM-4.6) and Composio (X search). Do not paste secrets." Settings has a "panic mode" that disables curator entirely. |
| R9 | trygravity.ai is a young company; pricing or platform shutdown would invalidate the monetization story | Code keeps the ad slot abstraction generic — could swap to Carbon Ads or self-served Stripe-supported sponsorships if Gravity changes |
| R10 | `node-pty` requires per-Electron-version + per-arch native rebuild; macOS first means Apple Silicon AND Intel | Use `electron-rebuild` in postinstall; ship universal binaries via `electron-builder` |
| R11 | Three agent adapters at launch is the largest scope risk | Phase 1 ships **Claude Code only**; Phase 2 adds Codex; Phase 3 adds Freebuff. v1.0 release waits for all three. |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Cockpit** | The agent terminal pane — the "main" content area. |
| **Feed pane** | The picture-to-picture scroll feed. Two states: `peek` and `expanded`. |
| **Curator** | The GLM-4.6-powered service that turns a user prompt into ranked X queries. |
| **Agent adapter** | Per-CLI shim that knows how to detect prompt boundaries and clean output. |
| **Context bus** | In-renderer event bus that all components subscribe to for agent state. |
| **Peek strip** | The 80px right-edge sliver showing the next card, always visible when feed is on. |
| **Relevance chip** | The 11px italic line at the bottom of every card explaining why it was chosen. |

---

## 15. Reference components & external libraries

The landing page leans on **21st.dev / Aceternity UI** primitives (MIT-licensed, copy-paste rather than npm). All copied components live in `landing/components/ui/` once scaffolded; reference originals live in `references/ui/`.

### 15.1 Component inventory

| Component | Source | Used for | Spec location |
|---|---|---|---|
| `ContainerScroll` | 21st.dev / Aceternity | Landing hero — 3D scroll-triggered device reveal | `references/ui/container-scroll-animation.tsx` |
| `BentoGrid` (TBD) | 21st.dev / Aceternity | Sections 3-7 of landing — feature grid | post-spec selection |
| `MovingBorder` button (TBD) | 21st.dev / Aceternity | Primary CTAs — animated gradient border | post-spec selection |
| `InfiniteMovingCards` (TBD) | 21st.dev / Aceternity | "Powered by" / agent logos strip | post-spec selection |

Add components by browsing https://21st.dev/ during the implementation phase. Each lands under `landing/components/ui/` per the standard shadcn/Aceternity convention.

### 15.2 Required dependencies for landing

```jsonc
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "framer-motion": "^11.x",          // ContainerScroll, all motion primitives
    "lucide-react": "^0.x",            // Icon set
    "tailwindcss": "^4.x",
    "@radix-ui/react-*": "...",        // For shadcn primitives
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  }
}
```

### 15.3 Required dependencies for Electron app

```jsonc
{
  "dependencies": {
    "electron": "^32.x",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.x",
    "node-pty": "^1.x",                // Agent subprocess + PTY
    "@xterm/xterm": "^5.x",            // Terminal renderer (renamed from xterm)
    "@xterm/addon-fit": "^0.10.x",
    "framer-motion": "^11.x",          // Peek↔expanded transitions
    "tailwindcss": "^4.x",
    "zustand": "^5.x",                 // Settings store
    "keytar": "^7.x",                  // OS keychain for secrets
    "openai": "^4.x"                   // OpenRouter SDK (OpenAI-compatible) for GLM-4.6
  }
}
```

### 15.4 21st.dev usage pattern

When pulling new components from 21st.dev:

1. Browse the catalog, find the component, copy its `.tsx` source.
2. Save into `landing/components/ui/<component-name>.tsx`.
3. Install any framer-motion / lucide-react peers.
4. Wrap with our `--ink-*` and `--accent` tokens; never ship a 21st.dev component with its default rainbow gradients — recolor everything to our palette.
5. If the component has a "demo" file with sample data, store the demo in the same folder for reference but do not ship it.

---

## 16. Out of this spec — referenced separately

- Implementation plan → `docs/plans/2026-04-19-idex-implementation.md` (next step, via `/writing-plans`)
- Branding kit (logo lockups, ASCII variants, OG images) → TBD
- Privacy policy / Terms — needed before public release

---

**End of design spec v1.**
