import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFeed } from "@/store/feed";
import { useSettings } from "@/store/settings";
import { Card } from "./Card";
import { ChevronRight } from "lucide-react";

export function FeedPane() {
  const config = useSettings((s) => s.config);
  const cards = useFeed((s) => s.cards);
  const state = useFeed((s) => s.state);
  const setState = useFeed((s) => s.setState);
  const refresh = useFeed((s) => s.refresh);
  const isLoading = useFeed((s) => s.isLoading);

  const [focusedIdx, setFocusedIdx] = useState(0);
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
      className="relative flex flex-col bg-ink-0 border-l border-line overflow-hidden"
    >
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
            <header className="px-6 py-4 flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="size-6 rounded-full bg-accent flex items-center justify-center text-[11px] font-bold text-white">
                  X
                </div>
                <span className="text-[14px] font-semibold text-text-primary">For you</span>
                <span className="text-[11px] font-mono text-text-secondary ml-1">
                  dev · {cards.length}
                </span>
                {isLoading && (
                  <span className="text-[10px] font-mono text-accent uppercase tracking-wider ml-2 animate-pulse">
                    curating
                  </span>
                )}
              </div>
              <button
                onClick={() => setState("peek")}
                className="press-feedback text-[11px] font-mono text-text-secondary hover:text-text-primary inline-flex items-center gap-1 rounded px-2 py-1 border border-line"
              >
                <ChevronRight className="size-3" /> collapse
              </button>
            </header>

            {cards.length === 0 ? (
              <EmptyFeedState isLoading={isLoading} />
            ) : (
              <div
                ref={scrollerRef}
                className="flex-1 overflow-y-auto divide-y divide-line"
              >
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
                    className={i === focusedIdx ? "bg-ink-1/60" : ""}
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

function EmptyFeedState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-secondary">
        <span className="dot-soft-pulse size-2 rounded-full bg-accent" />
        <span className="text-[13px]">reading the room...</span>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-secondary px-8 text-center">
      <span className="text-[13px] leading-relaxed max-w-[320px]">
        the feed is quiet. send a prompt to wake it up.
      </span>
      <span className="text-[10.5px] font-mono text-text-secondary/70 inline-flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 rounded border border-line bg-ink-1 text-text-secondary">⏎</kbd>
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
