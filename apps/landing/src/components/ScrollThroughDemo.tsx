import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

/**
 * ScrollThroughDemo — the twin.so-style "you're using the product as you
 * scroll" section. Scroll position drives a fake IDEX cockpit through the
 * real flow in five stages:
 *
 *   0.0 — 0.2   open      cockpit idle, feed in peek
 *   0.2 — 0.4   prompt    user types, caret blinks
 *   0.4 — 0.6   arrive    feed expands, cards populate
 *   0.6 — 0.8   scroll    card stream moves past
 *   0.8 — 1.0   return    feed retreats, agent reply visible
 *
 * Each stage has an opacity ramp that's 0→1 in a 0.03 window, flat at 1
 * for 0.14, then 1→0 in the final 0.03. That's narrow enough that only
 * one narration block is ever readable at a time — the earlier version
 * crossfaded too widely and two stages bled through each other.
 */
export function ScrollThroughDemo() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  return (
    <section
      ref={ref}
      id="flow"
      className="relative rule-top atmosphere"
      style={{ height: "520vh" }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="h-full w-full max-w-[1480px] mx-auto px-8 grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)] gap-10 lg:gap-16 items-center">
          <NarrationColumn progress={scrollYProgress} />
          <CockpitStage progress={scrollYProgress} />
        </div>

        <StageDots progress={scrollYProgress} />

        {/* Right-edge progress rail — a hair-thin accent stripe filling as
            the reader scrolls. Tells them the section has a floor. */}
        <motion.div
          aria-hidden
          className="absolute top-0 right-0 h-full w-[2px] bg-accent origin-top"
          style={{
            scaleY: scrollYProgress,
            opacity: useTransform(scrollYProgress, [0, 0.03, 0.97, 1], [0, 1, 1, 0]),
          }}
        />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────── *
 * Narration (left column)                    *
 * ────────────────────────────────────────── */

interface Stage {
  range: [number, number];
  kicker: string;
  title: string;
  body: string;
}

const STAGES: Stage[] = [
  {
    range: [0.0, 0.2],
    kicker: "00 · open",
    title: "A clean room, already warm.",
    body: "Your agent is running the moment the window opens. No API-key popup, no model picker. You inherited the same terminal session you'd launch in a bare shell — just wrapped in chrome that understands it isn't the only thing you want to look at.",
  },
  {
    range: [0.2, 0.4],
    kicker: "01 · prompt",
    title: "You type like you always have.",
    body: "Same keystrokes, same tab-complete, same scrollback. The cockpit stays out of the way. A thin column holds its breath beside you — nothing obvious, just the hint that something else is listening.",
  },
  {
    range: [0.4, 0.6],
    kicker: "02 · arrive",
    title: "A feed takes the stage.",
    body: "While the agent thinks, a curator reads your last few turns and pulls real posts from Hacker News, Reddit, Bluesky — threads about exactly what you just asked. Not stock content. Not sidebar noise.",
  },
  {
    range: [0.6, 0.8],
    kicker: "03 · scroll",
    title: "You scroll, deliberately.",
    body: "It looks like X because it reads like X. The muscle memory you already trained. Seconds spent waiting on a generation become seconds spent absorbing — tangential, not repetitive.",
  },
  {
    range: [0.8, 1.0],
    kicker: "04 · return",
    title: "Your answer is already there.",
    body: "The feed retreats on its own the moment the agent finishes. No context switch, no tab rearrangement. You came back. It came back.",
  },
];

function NarrationColumn({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="relative h-[70vh] w-full">
      {STAGES.map((s, i) => (
        <StageText key={i} stage={s} progress={progress} />
      ))}
    </div>
  );
}

function StageText({ stage, progress }: { stage: Stage; progress: MotionValue<number> }) {
  const [a, b] = stage.range;
  // Narrow ramp so one block is visible at a time — the earlier version
  // had 0.08 crossfades which meant two titles sat at ~50% opacity and
  // read like a double-exposure.
  const fade = 0.03;
  const opacity = useTransform(
    progress,
    [a - fade, a + fade, b - fade, b + fade],
    [0, 1, 1, 0],
  );
  // Subtle y-drift so the block also moves as it comes and goes — reads
  // as cinematic, not template.
  const y = useTransform(progress, [a, b], [18, -18]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-0 flex flex-col justify-center pr-4"
    >
      <div className="section-number mb-4">{stage.kicker}</div>
      <h3 className="display text-text-primary text-[clamp(32px,4.2vw,60px)] leading-[1.02]">
        {stage.title}
      </h3>
      <p className="mt-5 text-text-secondary text-[15px] md:text-[16.5px] leading-[1.6] max-w-[460px]">
        {stage.body}
      </p>
    </motion.div>
  );
}

/* ────────────────────────────────────────── *
 * Stage dots (bottom indicator)              *
 * ────────────────────────────────────────── */

function StageDots({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
      {STAGES.map((s, i) => (
        <Dot key={i} stage={s} progress={progress} />
      ))}
    </div>
  );
}

function Dot({ stage, progress }: { stage: Stage; progress: MotionValue<number> }) {
  const [a, b] = stage.range;
  const width = useTransform(progress, [a, (a + b) / 2, b], [8, 22, 8]);
  const opacity = useTransform(progress, [a - 0.04, a + 0.02, b - 0.02, b + 0.04], [0.3, 1, 1, 0.3]);
  return (
    <motion.span
      style={{ width, opacity }}
      className="h-[4px] rounded-full bg-accent transition-colors"
    />
  );
}

/* ────────────────────────────────────────── *
 * Cockpit mockup (right column)              *
 * ────────────────────────────────────────── */

const PROMPT_TEXT = "help me wire ai-generated cover images into the post editor";

function CockpitStage({ progress }: { progress: MotionValue<number> }) {
  // Feed column width. The feed lives at peek during "open" and "prompt",
  // expands during "arrive" and "scroll", retreats during "return".
  const feedWidth = useTransform(
    progress,
    [0.0, 0.38, 0.5, 0.78, 0.92],
    ["68px", "68px", "64%", "64%", "68px"],
  );

  // Rotate the cockpit a hair on approach and departure so it feels
  // physical, not pasted in. Very subtle — clamp to ±0.5deg.
  const cockpitRotate = useTransform(progress, [0, 0.5, 1], [-0.5, 0, 0.5]);
  const cockpitScale = useTransform(progress, [0, 0.5, 1], [0.985, 1, 0.985]);
  const cockpitY = useTransform(progress, [0, 1], [8, -8]);

  return (
    <motion.div
      style={{
        rotate: cockpitRotate,
        scale: cockpitScale,
        y: cockpitY,
      }}
      className="relative w-full"
    >
      {/* Halo behind the cockpit — makes it read as lifted off the page */}
      <motion.div
        aria-hidden
        className="absolute -inset-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(61,123,255,0.18), transparent 65%)",
          opacity: useTransform(progress, [0, 0.1, 0.9, 1], [0, 1, 1, 0.4]),
        }}
      />

      <div
        className="relative rounded-2xl overflow-hidden border border-line bg-ink-0 shadow-[0_40px_140px_rgba(0,0,0,0.65)]"
        style={{ aspectRatio: "16 / 10" }}
      >
        {/* Top chrome */}
        <div className="flex items-center gap-2 h-9 bg-ink-1/80 border-b border-line px-4">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-5 text-[11.5px] text-text-tertiary font-mono tracking-[-0.01em]">
            idex · claude code · ~/post-editor
          </span>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-text-tertiary font-mono">
            <span>agent</span>
            <span className="opacity-30">·</span>
            <span className="opacity-60">autopilot</span>
            <span className="opacity-30">·</span>
            <span className="opacity-60">editor</span>
          </div>
        </div>

        {/* Body: terminal left, feed right */}
        <div className="flex h-[calc(100%-36px)]">
          <TerminalColumn progress={progress} />
          <motion.div
            style={{ width: feedWidth, minWidth: "68px" }}
            className="relative h-full bg-ink-0 border-l border-line shrink-0 overflow-hidden"
          >
            <FeedPeek progress={progress} />
            <FeedExpanded progress={progress} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────── *
 * Terminal column                            *
 * ────────────────────────────────────────── */

function TerminalColumn({ progress }: { progress: MotionValue<number> }) {
  const promptFade = useTransform(progress, [0.18, 0.24], [0, 1]);
  const typedChars = useTransform(progress, [0.22, 0.42], [0, PROMPT_TEXT.length]);
  const thinkingOpacity = useTransform(progress, [0.42, 0.46, 0.78, 0.82], [0, 1, 1, 0]);
  const replyOpacity = useTransform(progress, [0.82, 0.88], [0, 1]);
  const caretOpacity = useTransform(progress, [0.22, 0.42, 0.82, 0.86], [1, 1, 1, 0]);
  const cursorBlink = useTransform(progress, [0.0, 0.18, 0.22], [1, 1, 0]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-ink-0">
      <div className="flex-1 min-h-0 overflow-hidden px-5 py-4 font-mono text-[12px] leading-[1.6] text-text-primary">
        {/* Ambient preamble — always visible so the terminal is never
            blank. Looks like a real Claude Code boot. */}
        <div className="text-text-tertiary">claude code 2.5 · sonnet 4.6 · ready</div>
        <div className="text-text-tertiary/70 mt-0.5">
          tip: type <span className="text-text-secondary">/help</span> to see commands
        </div>

        {/* Empty-line idle caret — visible during stage 0 so the terminal
            "breathes" before the user types. */}
        <motion.div style={{ opacity: cursorBlink }} className="mt-4">
          <span className="text-accent">›</span>{" "}
          <span
            className="inline-block w-[6px] h-[13px] bg-accent align-text-bottom animate-pulse"
            style={{ verticalAlign: "-2px" }}
          />
        </motion.div>

        {/* Prompt line — user's typed text. */}
        <motion.div style={{ opacity: promptFade }} className="mt-4">
          <span className="text-accent">›</span>{" "}
          <TypedText chars={typedChars} source={PROMPT_TEXT} />
          <motion.span
            style={{ opacity: caretOpacity, verticalAlign: "-2px" }}
            className="inline-block w-[6px] h-[13px] bg-accent ml-[1px] animate-pulse"
          />
        </motion.div>

        {/* Thinking indicator — replaces the caret while the feed takes over. */}
        <motion.div style={{ opacity: thinkingOpacity }} className="mt-4 text-text-tertiary">
          <span className="inline-flex items-center gap-2">
            <span className="dot-soft-pulse inline-block size-1.5 rounded-full bg-accent" />
            working… <span className="opacity-60">(esc to interrupt)</span>
          </span>
        </motion.div>

        {/* Reply block — the last stage. */}
        <motion.div
          style={{ opacity: replyOpacity }}
          className="mt-4 space-y-1.5 text-text-secondary"
        >
          <div>
            <span className="text-accent/80">●</span> Read{" "}
            <span className="text-text-primary">PostEditor.tsx</span>,{" "}
            <span className="text-text-primary">api/images.ts</span>,{" "}
            <span className="text-text-primary">lib/hash.ts</span>
          </div>
          <div>
            <span className="text-accent/80">●</span> Edited 3 files · +142 −18
          </div>
          <div>
            <span className="text-accent/80">●</span> Added{" "}
            <span className="text-text-primary">
              PUT /api/posts/[id]/cover
            </span>{" "}
            with prompt-hash caching
          </div>
          <div className="pt-2 text-text-primary">
            Cover images now stream inline while full-res writes in the background.
          </div>
        </motion.div>
      </div>

      {/* Bottom status strip */}
      <div className="h-7 border-t border-line bg-ink-1/70 px-4 flex items-center gap-3 text-[10.5px] text-text-tertiary font-mono">
        <StatusIndicator progress={progress} />
        <span className="opacity-40">·</span>
        <span>1 session</span>
        <span className="ml-auto opacity-60 truncate">
          ⌘T new · ⌘K palette
        </span>
      </div>
    </div>
  );
}

function StatusIndicator({ progress }: { progress: MotionValue<number> }) {
  // Ready → generating → done, tracked to agent state in the fake.
  // Each label has its own animated opacity so they crossfade in place.
  return (
    <span className="inline-flex items-center gap-1.5 relative min-w-[84px]">
      <Label
        text="claude · ready"
        dot="bg-text-secondary"
        progress={progress}
        range={[0.0, 0.2]}
      />
      <Label
        text="claude · working"
        dot="bg-accent dot-soft-pulse"
        progress={progress}
        range={[0.2, 0.82]}
      />
      <Label
        text="claude · done"
        dot="bg-accent"
        progress={progress}
        range={[0.82, 1.0]}
      />
    </span>
  );
}

function Label({
  text,
  dot,
  progress,
  range,
}: {
  text: string;
  dot: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const [a, b] = range;
  const fade = 0.02;
  const opacity = useTransform(
    progress,
    [a - fade, a + fade, b - fade, b + fade],
    [0, 1, 1, 0],
  );
  return (
    <motion.span
      style={{ opacity }}
      className="absolute left-0 top-0 bottom-0 flex items-center gap-1.5 whitespace-nowrap"
    >
      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
      {text}
    </motion.span>
  );
}

function TypedText({ chars, source }: { chars: MotionValue<number>; source: string }) {
  const text = useTransform(chars, (c) => source.slice(0, Math.round(c)));
  return <motion.span className="text-text-primary">{text}</motion.span>;
}

/* ────────────────────────────────────────── *
 * Feed — peek + expanded                     *
 * ────────────────────────────────────────── */

function FeedPeek({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.0, 0.36, 0.42, 0.48], [1, 1, 0.4, 0]);
  return (
    <motion.div
      style={{ opacity }}
      className="absolute inset-0 flex flex-col items-center justify-between py-5 pointer-events-none"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-[20px] text-text-primary"
        aria-hidden
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
      <div
        className="flex items-center justify-center px-1 min-h-0 overflow-hidden"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          maxHeight: "55%",
        }}
      >
        <span className="text-[10.5px] font-mono text-text-secondary tracking-[0.08em] whitespace-nowrap">
          cover images
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="size-1 rounded-full bg-text-tertiary/60" />
      </div>
    </motion.div>
  );
}

function FeedExpanded({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.42, 0.52, 0.78, 0.88], [0, 1, 1, 0]);
  const cardsY = useTransform(progress, [0.5, 0.82], [0, -440]);
  const curatingOpacity = useTransform(progress, [0.44, 0.52, 0.58, 0.62], [1, 1, 0.4, 0]);
  const xCloseScale = useTransform(progress, [0.78, 0.86], [0, 1]);

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 flex flex-col">
      {/* Sticky X header */}
      <div
        className="sticky top-0 z-10 h-[44px] flex items-stretch"
        style={{
          borderBottom: "1px solid #2f3336",
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <FakeTab label="For you" active />
        <FakeTab label="Following" />
        <div className="ml-auto mr-2 flex items-center gap-2">
          <motion.span
            style={{ opacity: curatingOpacity, color: "#71767b" }}
            className="text-[10.5px] font-mono animate-pulse"
          >
            curating…
          </motion.span>
          <motion.span
            style={{ scale: xCloseScale }}
            className="size-7 rounded-full flex items-center justify-center text-[#71767b]"
            aria-hidden
          >
            ✕
          </motion.span>
        </div>
      </div>

      {/* Cards stream */}
      <div className="flex-1 overflow-hidden">
        <motion.div style={{ y: cardsY }} className="flex flex-col">
          {FEED_CARDS.map((c, i) => (
            <FakeCard key={i} card={c} />
          ))}
          {FEED_CARDS.map((c, i) => (
            <FakeCard key={`loop-${i}`} card={c} />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────── *
 * Fake cards                                 *
 * ────────────────────────────────────────── */

const FEED_CARDS: Array<{
  name: string;
  handle: string;
  avatar: string;
  verified?: boolean;
  source?: string;
  sourceBg?: string;
  body: string;
  time: string;
  replies: string;
  reposts: string;
  likes: string;
}> = [
  {
    name: "ryan dahl",
    handle: "rough__draft",
    avatar: "#e0b76c",
    verified: true,
    body:
      "If you're generating hero images on write, cache by a hash of the prompt + style, not the post id. You pay once per distinct look, not once per edit. Saved us ~94% of Runway spend last month.",
    time: "1h",
    replies: "48",
    reposts: "212",
    likes: "2.4K",
  },
  {
    name: "ellen",
    handle: "ellendb",
    avatar: "#8aa8ff",
    source: "HN",
    sourceBg: "#ff6600",
    body:
      "Show HN — cover image generator for our CMS (SDXL Turbo + Ideogram fallback). Took 2 weekends. 340 comments if anyone wants to see the pipeline.",
    time: "3h",
    replies: "91",
    reposts: "38",
    likes: "812",
  },
  {
    name: "jesse pollak",
    handle: "jessepollak",
    avatar: "#b197ff",
    verified: true,
    body:
      "weird hot take — ai-generated cover images have to look *worse* than editorial stock, not better. if they look too clean everyone clocks them instantly.",
    time: "6h",
    replies: "127",
    reposts: "334",
    likes: "5.1K",
  },
  {
    name: "nora",
    handle: "nora.dev",
    avatar: "#f7a5c2",
    source: "r/nextjs",
    sourceBg: "#ff4500",
    body:
      "For anyone wiring AI cover gen into next.js app router — you want the image to arrive on a background route and revalidate the post page, not block the write action. ISR + tag revalidation is the clean path.",
    time: "9h",
    replies: "24",
    reposts: "18",
    likes: "604",
  },
  {
    name: "amjad masad",
    handle: "amasad",
    avatar: "#5eead4",
    verified: true,
    body:
      "cover images have become the new og:image. the model you pick is the vibe of your whole feed. pick well.",
    time: "12h",
    replies: "72",
    reposts: "218",
    likes: "3.2K",
  },
  {
    name: "paige",
    handle: "dynamicwebpaige",
    avatar: "#f9d774",
    verified: true,
    body:
      "quick pattern for post editors: stream the generated preview into the draft while the full-res renders in the background. users feel the 'ai did this for me' moment before the file even lands on s3.",
    time: "1d",
    replies: "33",
    reposts: "154",
    likes: "1.8K",
  },
];

function FakeTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className="relative flex-1 max-w-[130px] flex items-center justify-center"
      style={{ color: active ? "#e7e9ea" : "#71767b" }}
    >
      <span
        className="text-[13px]"
        style={{ fontWeight: active ? 700 : 500 }}
      >
        {label}
      </span>
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full"
          style={{ width: "44px", background: "#1d9bf0" }}
        />
      )}
    </div>
  );
}

function FakeCard({ card }: { card: (typeof FEED_CARDS)[number] }) {
  return (
    <article
      className="relative px-4 py-3"
      style={{ borderBottom: "1px solid #2f3336" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 size-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
          style={{ background: card.avatar }}
          aria-hidden
        >
          {card.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] leading-[1.2]">
            <span className="font-semibold truncate" style={{ color: "#e7e9ea" }}>
              {card.name}
            </span>
            {card.verified && (
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" style={{ color: "#1d9bf0" }}>
                <path
                  fill="currentColor"
                  d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
                />
              </svg>
            )}
            {card.source && card.sourceBg && (
              <span
                className="px-1.5 rounded text-[10px] font-semibold leading-[1.4] text-white"
                style={{ background: card.sourceBg }}
              >
                {card.source}
              </span>
            )}
            <span className="truncate" style={{ color: "#71767b" }}>
              @{card.handle}
            </span>
            <span style={{ color: "#71767b" }}>·</span>
            <span className="shrink-0" style={{ color: "#71767b" }}>
              {card.time}
            </span>
          </div>
          <p
            className="mt-1 text-[12.5px] leading-[1.4]"
            style={{ color: "#e7e9ea" }}
          >
            {card.body}
          </p>
          <div
            className="mt-2 flex items-center gap-6 text-[11px] font-mono tabular-nums"
            style={{ color: "#71767b" }}
          >
            <span>💬 {card.replies}</span>
            <span>↻ {card.reposts}</span>
            <span>♥ {card.likes}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
