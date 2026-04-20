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
  const isLoading = useFeed((s) => s.isLoading);

  const [focusedIdx, setFocusedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"forYou" | "following">("forYou");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll while expanded
  useEffect(() => {
    if (state !== "expanded") return;
    const interval = setInterval(() => {
      setFocusedIdx((i) => (cards.length === 0 ? 0 : (i + 1) % cards.length));
    }, Math.max(2, config.autoscrollSeconds) * 1000);
    return () => clearInterval(interval);
  }, [state, config.autoscrollSeconds, cards.length]);

  // Snap-scroll when focusedIdx changes
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

  // Count source-origin mix for the curator indicator.
  const sourceMix = countSources(cards);

  if (!config.feedEnabled) {
    return (
      <aside style={{ width: "40px", flexShrink: 0 }} className="bg-ink-0 border-l border-line flex items-center justify-center">
        <button
          onClick={() => useSettings.getState().patch({ feedEnabled: true })}
          className="text-text-secondary hover:text-text-primary -rotate-90 origin-center text-[11px] font-mono uppercase tracking-wider whitespace-nowrap"
          title="Enable feed"
        >
          enable feed
        </button>
      </aside>
    );
  }

  // Expanded state dominates the screen: cockpit shrinks to a PiP-style
  // left column while the feed fills the rest. This is the picture-in-
  // picture moment the product is built around.
  const targetWidth = state === "expanded" ? "75%" : "72px";
  const collapsedWidth = "72px";

  return (
    <motion.aside
      initial={{ width: collapsedWidth }}
      animate={{ width: targetWidth }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 28,
        mass: 0.85,
      }}
      style={{
        height: "100%",
        minWidth: collapsedWidth,
        flexShrink: 0,
        flexGrow: 0,
      }}
      className="relative flex flex-col bg-ink-0 overflow-hidden"
    >
      {/* Left edge divider matches X's 1px line */}
      <div
        aria-hidden
        className="absolute top-0 left-0 bottom-0 w-px"
        style={{ background: X_DIVIDER }}
      />

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

function PeekStrip({ card, onExpand }: { card?: import("@idex/types").Card; onExpand: () => void }) {
  return (
    <button
      onClick={onExpand}
      className="w-full h-full flex flex-col items-center justify-center gap-3 group hover:bg-ink-1/60 transition-colors"
      title={card?.relevanceReason ?? "Open feed"}
    >
      <span className="text-[9px] uppercase tracking-[0.24em] font-mono text-text-secondary group-hover:text-accent transition-colors">
        feed
      </span>
      <div className="peek-pulse size-8 rounded-lg border border-line bg-ink-1 flex items-center justify-center">
        <span className="size-1.5 rounded-full bg-accent" />
      </div>
      <span className="text-[9px] font-mono text-text-secondary/60">
        {card ? "●" : "○"}
      </span>
    </button>
  );
}
