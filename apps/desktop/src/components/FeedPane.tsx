import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFeed } from "@/store/feed";
import { useSettings } from "@/store/settings";
import { Card } from "./Card";
import { X as XIcon } from "lucide-react";

/** X divider color — used in header/divider lines to match the card chrome. */
const X_DIVIDER = "#2f3336";
const X_MUTED = "#71767b";
const X_TEXT = "#e7e9ea";

export function FeedPane() {
  const config = useSettings((s) => s.config);
  const cards = useFeed((s) => s.cards);
  const state = useFeed((s) => s.state);
  const setState = useFeed((s) => s.setState);
  const refresh = useFeed((s) => s.refresh);
  const touch = useFeed((s) => s.touch);
  const isLoading = useFeed((s) => s.isLoading);

  const [focusedIdx, setFocusedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"forYou" | "following">("forYou");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll is off in expanded — the user should own their scroll
  // velocity when they're actively reading. We used to cycle the focused
  // card on a timer here, but that made the surface feel like a moving
  // sidewalk instead of a real feed. The peek state is ambient enough on
  // its own (current topic rotating + source indicators pulsing).

  // Smooth-scroll only for programmatic focus changes (e.g., user clicks
  // on a card in the list); natural scrolling is untouched.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.children[focusedIdx] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedIdx]);

  // Pre-load starter feed once on mount
  useEffect(() => {
    if (cards.length === 0) refresh();
  }, [cards.length, refresh]);

  // Keyboard nav in expanded feed: Arrow↑/↓ and j/k move the focused-card
  // rail, Esc collapses back to peek. We only attach when expanded so the
  // terminal keeps its key bindings in cockpit/peek mode.
  useEffect(() => {
    if (state !== "expanded") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (inEditable) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, Math.max(0, cards.length - 1)));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setState("peek");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cards.length, setState]);

  // Count source-origin mix for the curator indicator.
  const sourceMix = countSources(cards);

  if (!config.feedEnabled) {
    return (
      <aside style={{ width: "40px", flexShrink: 0 }} className="bg-ink-0 border-l border-line flex items-center justify-center">
        <button
          onClick={() => useSettings.getState().patch({ feedEnabled: true })}
          className="text-text-tertiary hover:text-text-primary -rotate-90 origin-center text-[12px] tracking-[-0.005em] whitespace-nowrap transition-colors"
          title="Enable feed"
        >
          Enable feed
        </button>
      </aside>
    );
  }

  /*
   * Full-screen takeover layout.
   *
   * Peek state  → thin 72px strip docked to the right edge of the
   *              window, still in the flex row so the cockpit reserves
   *              the gutter.
   * Expanded    → the feed OCCUPIES the entire window as a fixed
   *              overlay. The cockpit keeps running underneath but is
   *              hidden for the duration. When Claude finishes the
   *              dwell-guarded collapse in bindToAgent snaps back to
   *              peek and the terminal is front and center again.
   */
  const PEEK_WIDTH = "72px";
  const isExpanded = state === "expanded";

  return (
    <motion.aside
      initial={false}
      animate={{
        opacity: isExpanded ? 1 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 28,
        mass: 0.85,
      }}
      style={{
        minWidth: isExpanded ? "100%" : PEEK_WIDTH,
        width: isExpanded ? "100%" : PEEK_WIDTH,
        height: isExpanded ? "100vh" : "100%",
        flexShrink: 0,
        flexGrow: 0,
        position: isExpanded ? "fixed" : "relative",
        top: isExpanded ? 0 : undefined,
        left: isExpanded ? 0 : undefined,
        right: isExpanded ? 0 : undefined,
        bottom: isExpanded ? 0 : undefined,
        zIndex: isExpanded ? 40 : "auto",
      }}
      className="flex flex-col bg-ink-0 overflow-hidden"
      onPointerDown={touch}
      onWheel={touch}
    >
      {/* Left edge divider matches X's 1px line — only when docked */}
      {!isExpanded && (
        <div
          aria-hidden
          className="absolute top-0 left-0 bottom-0 w-px"
          style={{ background: X_DIVIDER }}
        />
      )}

      {state === "peek" && (
        <PeekStrip
          card={cards[focusedIdx]}
          onExpand={() => setState("expanded")}
        />
      )}

      <AnimatePresence>
        {state === "expanded" && (
          <motion.div
            key="expanded-feed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-col h-full"
          >
            {/* Sticky glass header — X style with For you / Following tabs */}
            <header
              className="sticky top-0 z-10 glass"
              style={{
                borderBottom: `1px solid ${X_DIVIDER}`,
                background: "rgba(0,0,0,0.65)",
              }}
            >
              <div className="flex items-stretch h-[53px]">
                <XTab
                  label="For you"
                  active={activeTab === "forYou"}
                  onClick={() => setActiveTab("forYou")}
                />
                <XTab
                  label="Following"
                  active={activeTab === "following"}
                  onClick={() => setActiveTab("following")}
                />

                {/* Right side — curator meta + collapse button */}
                <div className="ml-auto flex items-center gap-3 pr-3">
                  <SourceMix mix={sourceMix} total={cards.length} />

                  {isLoading && (
                    <span
                      className="text-[11px] tabular-nums animate-pulse"
                      style={{ color: X_MUTED }}
                    >
                      curating
                    </span>
                  )}

                  <button
                    onClick={() => setState("peek")}
                    className="press-feedback x-header-btn size-8 rounded-full flex items-center justify-center transition-colors"
                    title="Collapse"
                    aria-label="Collapse feed"
                    style={{ color: X_MUTED }}
                  >
                    <XIcon className="size-[18px]" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </header>

            {cards.length === 0 ? (
              <EmptyFeedState isLoading={isLoading} />
            ) : (
              <div ref={scrollerRef} className="flex-1 overflow-y-auto">
                {cards.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.04,
                      duration: 0.35,
                      ease: [0.23, 1, 0.32, 1],
                    }}
                    onClick={() => setFocusedIdx(i)}
                  >
                    <Card
                      card={c}
                      focused={i === focusedIdx}
                      shimmer={isLoading && c.source === "starter"}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

/** Header tab — X/Twitter style with blue underline on active. */
function XTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="x-tab relative flex-1 max-w-[200px] min-w-[100px] flex items-center justify-center transition-colors"
      style={{
        color: active ? X_TEXT : X_MUTED,
      }}
    >
      <span
        className="text-[15px] py-4"
        style={{ fontWeight: active ? 700 : 500 }}
      >
        {label}
      </span>
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 rounded-full"
          style={{
            width: "56px",
            background: "#1d9bf0",
          }}
        />
      )}
    </button>
  );
}

/** Source-origin mix indicator — tiny dots showing HN/reddit/other ratio. */
function SourceMix({
  mix,
  total,
}: {
  mix: { hn: number; reddit: number; starter: number; other: number };
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div
      className="flex items-center gap-2 text-[12px] tabular-nums"
      style={{ color: X_MUTED }}
      title={`${mix.hn} HN · ${mix.reddit} Reddit · ${mix.starter + mix.other} seed`}
    >
      <span>curator</span>
      <span style={{ color: "#3d7bff" }}>·</span>
      <div className="flex items-center gap-1">
        {mix.hn > 0 && (
          <span
            className="size-1.5 rounded-full"
            style={{ background: "#ff6600" }}
            aria-label={`${mix.hn} from HN`}
          />
        )}
        {mix.reddit > 0 && (
          <span
            className="size-1.5 rounded-full"
            style={{ background: "#ff4500" }}
            aria-label={`${mix.reddit} from Reddit`}
          />
        )}
        {(mix.starter + mix.other) > 0 && (
          <span
            className="size-1.5 rounded-full"
            style={{ background: "#3d7bff" }}
            aria-label={`${mix.starter + mix.other} seed`}
          />
        )}
      </div>
      <span>{total}</span>
    </div>
  );
}

function countSources(cards: import("@idex/types").Card[]) {
  const mix = { hn: 0, reddit: 0, starter: 0, other: 0 };
  for (const c of cards) {
    if (c.source === "hackernews") mix.hn++;
    else if (c.source === "reddit") mix.reddit++;
    else if (c.source === "starter") mix.starter++;
    else mix.other++;
  }
  return mix;
}

function EmptyFeedState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3"
        style={{ color: X_MUTED }}
      >
        <span className="dot-soft-pulse size-2 rounded-full bg-accent" />
        <span className="text-[14px]">reading the room...</span>
      </div>
    );
  }
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ color: X_MUTED }}
    >
      <span
        className="text-[15px] leading-relaxed max-w-[320px]"
        style={{ color: X_TEXT }}
      >
        Welcome to your feed.
      </span>
      <span className="text-[13px] leading-relaxed max-w-[320px]">
        Send a prompt to wake it up.
      </span>
      <span className="text-[11px] font-mono inline-flex items-center gap-1.5 mt-1">
        <kbd
          className="px-1.5 py-0.5 rounded"
          style={{
            border: `1px solid ${X_DIVIDER}`,
            background: "#16181c",
            color: X_MUTED,
          }}
        >
          ⏎
        </kbd>
        send
      </span>
    </div>
  );
}

function PeekStrip({ card: _card, onExpand }: { card?: import("@idex/types").Card; onExpand: () => void }) {
  const topics = useFeed((s) => s.topics);
  const isLoading = useFeed((s) => s.isLoading);

  // Only show a label when we have a real extracted topic from the user's
  // prompt. If topics is empty we fall back to NOTHING — the old fallback
  // chain was pulling a card's full `relevanceReason` sentence like
  // "Hacker News match for typescript" and rotating it vertically, which
  // spilled down the whole right edge of the screen. Clean silence is
  // better than a sentence crammed into a 72px column.
  const rawPrimary = topics[0];
  const rawSecondary = topics[1];
  // Hard cap each word to 14 chars so nothing can blow out the column
  // vertically. Drop any topic that's pure noise (too short or all digits).
  const primary = rawPrimary && rawPrimary.length <= 18 ? rawPrimary : null;
  const secondary = rawSecondary && rawSecondary.length <= 14 ? rawSecondary : null;

  return (
    <button
      onClick={onExpand}
      className="w-full h-full flex flex-col items-center justify-between py-5 group hover:bg-ink-1/60 transition-colors overflow-hidden"
      title={topics.length > 0 ? `Reading about: ${topics.slice(0, 3).join(", ")}` : "Open feed"}
    >
      {/* Real X logo — monospace glyph drawn as an SVG so it stays crisp
          at any DPR and doesn't need an icon font. */}
      <div
        className={`size-8 flex items-center justify-center transition-all ${
          isLoading ? "opacity-70" : "opacity-100"
        } group-hover:scale-110`}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[22px] text-text-primary group-hover:text-accent transition-colors"
          fill="currentColor"
          aria-hidden
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
        </svg>
      </div>

      {/* Current topic, vertically rotated so it fits the thin column.
          Constrained to the middle 55% of the available height so it can
          never climb past the logo or crash into the bottom indicator. */}
      {primary && (
        <div
          className="flex items-center justify-center px-1 min-h-0 overflow-hidden"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            maxHeight: "55%",
          }}
        >
          <span className="text-[11px] font-mono text-text-secondary group-hover:text-text-primary transition-colors tracking-wide whitespace-nowrap truncate">
            {primary}
            {secondary && <span className="text-text-tertiary mx-2">·</span>}
            {secondary && <span className="text-text-tertiary">{secondary}</span>}
          </span>
        </div>
      )}

      {/* Bottom state glyph — three soft-pulsing dots while curating, a
          single tiny accent dot while idle. Replaces the old literal
          "feed" word which felt redundant next to the X logo at the top
          and looked like leftover debug copy. */}
      <div className="flex items-center gap-1">
        {isLoading ? (
          <>
            <span className="dot-soft-pulse size-1 rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
            <span className="dot-soft-pulse size-1 rounded-full bg-accent" style={{ animationDelay: "180ms" }} />
            <span className="dot-soft-pulse size-1 rounded-full bg-accent" style={{ animationDelay: "360ms" }} />
          </>
        ) : (
          <span className="size-1 rounded-full bg-text-tertiary/60" />
        )}
      </div>
    </button>
  );
}
