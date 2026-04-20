import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFeed } from "@/store/feed";
import { useSettings } from "@/store/settings";
import { Card } from "./Card";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

export function FeedPane() {
  const config = useSettings((s) => s.config);
  const cards = useFeed((s) => s.cards);
  const state = useFeed((s) => s.state);
  const setState = useFeed((s) => s.setState);
  const refresh = useFeed((s) => s.refresh);

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

  const targetWidth = state === "expanded" ? "420px" : "72px";
  const collapsedWidth = "72px";

  return (
    <motion.aside
      initial={{ width: collapsedWidth }}
      animate={{ width: targetWidth }}
      transition={{
        duration: state === "expanded" ? 0.28 : 0.22,
        ease: [0.32, 0.72, 0, 1],
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
        {state === "expanded" && cards.length > 0 && (
          <motion.div
            key="expanded-feed"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-col h-full"
          >
            <header className="px-6 py-4 flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-2 text-[12px] font-mono text-text-secondary">
                <Sparkles className="size-3.5 text-accent" />
                Curator · {cards.length} cards
              </div>
              <button
                onClick={() => setState("peek")}
                className="press-feedback text-[11px] font-mono text-text-secondary hover:text-text-primary inline-flex items-center gap-1 rounded px-2 py-1 border border-line"
              >
                <ChevronRight className="size-3" /> collapse
              </button>
            </header>

            <div
              ref={scrollerRef}
              className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center gap-6 snap-y snap-mandatory"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0px, black 80px, black calc(100% - 80px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0px, black 80px, black calc(100% - 80px), transparent 100%)",
              }}
            >
              {cards.map((c, i) => (
                <div
                  key={c.id}
                  className="snap-center w-full flex justify-center"
                  onClick={() => setFocusedIdx(i)}
                >
                  <Card card={c} focused={i === focusedIdx} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
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
