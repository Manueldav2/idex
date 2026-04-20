import { motion } from "framer-motion";

/**
 * A phone-shaped X-style feed demo, shown at the end of the
 * scroll-morph hero. Fake tweets scroll upward on a loop.
 */
const TWEETS = [
  {
    author: "Matt Pocock",
    handle: "mattpocockuk",
    text: "TypeScript tip: `satisfies` is the operator I reach for most — it checks type without widening. Cleanest pattern in modern TS.",
    ago: "2h",
  },
  {
    author: "Emil Kowalski",
    handle: "emilkowalski_",
    text: "An underused trick: use clip-path: inset() to animate reveals. Hardware accelerated, no overflow hacks.",
    ago: "6h",
  },
  {
    author: "Addy Osmani",
    handle: "addyosmani",
    text: "INP > LCP for 2026. Every click, every tap. Optimizing it forces you to fix the long tasks LCP misses.",
    ago: "9h",
  },
  {
    author: "swyx",
    handle: "swyx",
    text: "2024: 'show me a diff'. 2026: 'go fix these 14 things, ping me when done'. The agent loop is the new IDE.",
    ago: "14h",
  },
  {
    author: "Dan Abramov",
    handle: "dan_abramov",
    text: "Hot take: most useEffect bugs are state-shape bugs. If your effect has 5 deps + a guard clause, your state is wrong.",
    ago: "1d",
  },
];

export function PhoneFeedDemo() {
  return (
    <div className="h-full w-full flex flex-col bg-ink-0 overflow-hidden relative">
      {/* Phone status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] font-mono text-text-primary">
        <span>9:41</span>
        <span className="tracking-wider">•••</span>
      </div>

      {/* App header */}
      <div className="flex items-center justify-between px-4 pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-accent flex items-center justify-center text-[9px] font-mono text-white">
            X
          </div>
          <span className="text-[11px] font-display font-semibold text-text-primary">
            For you · dev
          </span>
        </div>
        <span className="text-[9px] font-mono text-accent bg-accent-soft px-1.5 py-0.5 rounded">
          curator
        </span>
      </div>

      {/* Scrolling tweet column */}
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="absolute inset-x-0 top-0 flex flex-col gap-0"
          animate={{ y: ["0%", "-50%"] }}
          transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        >
          {[...TWEETS, ...TWEETS].map((t, i) => (
            <div key={i} className="border-b border-line px-4 py-3 shrink-0">
              <div className="flex items-start gap-2.5">
                <div className="size-8 rounded-full bg-ink-2 shrink-0 flex items-center justify-center text-[10px] font-mono text-text-secondary">
                  {t.author[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] leading-tight">
                    <span className="font-display font-semibold text-text-primary">{t.author}</span>
                    <span className="text-text-secondary">@{t.handle} · {t.ago}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-primary/90">
                    {t.text}
                  </p>
                  <div className="mt-2 flex items-center gap-5 text-[10px] text-text-secondary">
                    <span>♡ {23 + i}</span>
                    <span>↻ {7 + i}</span>
                    <span>💬 {4 + i}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Gradient fades */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-ink-0 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-ink-0 to-transparent" />
      </div>
    </div>
  );
}
