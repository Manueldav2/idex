import { motion } from "framer-motion";

/**
 * Authentic X colour tokens — kept identical to live x.com so the
 * landing demo looks like a screenshot, not a mock-up.
 */
const X = {
  bg: "#000",
  text: "#e7e9ea",
  muted: "#71767b",
  divider: "#2f3336",
  blue: "#1d9bf0",
};

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function VerifiedCheck({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ color: X.blue }}>
      <path
        fill="currentColor"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36z"
      />
    </svg>
  );
}

function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z" />
    </svg>
  );
}

function RepostIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.78 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09zm15.503 4.42c0-2.35-1.903-4.25-4.25-4.25H11v2.5h4.997c.97 0 1.753.78 1.753 1.75v7.37l-1.647-1.53-1.706 1.82 4.603 4.3 4.603-4.3-1.706-1.82-1.647 1.53V8.21z" />
    </svg>
  );
}

function LikeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
    </svg>
  );
}

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
    <div className="h-full w-full flex flex-col overflow-hidden relative" style={{ background: X.bg, color: X.text }}>
      {/* Phone status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] font-mono" style={{ color: X.text }}>
        <span>9:41</span>
        <span className="tracking-wider" style={{ color: X.muted }}>•••</span>
      </div>

      {/* X header — centered logo, X-style "For you / Following" tabs */}
      <div className="border-b" style={{ borderColor: X.divider }}>
        <div className="flex items-center justify-center px-4 py-2">
          <XLogo className="size-5" />
        </div>
        <div className="grid grid-cols-2 text-[11px] font-bold">
          <button
            className="py-2.5 relative flex items-center justify-center"
            style={{ color: X.text }}
          >
            For you
            <span className="absolute bottom-0 h-[3px] w-7 rounded-full" style={{ background: X.blue }} />
          </button>
          <button className="py-2.5" style={{ color: X.muted, fontWeight: 500 }}>
            Following
          </button>
        </div>
      </div>

      {/* Scrolling tweet column */}
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="absolute inset-x-0 top-0 flex flex-col gap-0"
          animate={{ y: ["0%", "-50%"] }}
          transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        >
          {[...TWEETS, ...TWEETS].map((t, i) => (
            <div key={i} className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${X.divider}` }}>
              <div className="flex items-start gap-2.5">
                <div
                  className="size-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{ background: "#3a3a3a", color: X.text }}
                >
                  {t.author[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-[11px] leading-tight">
                    <span className="font-bold truncate" style={{ color: X.text }}>{t.author}</span>
                    <VerifiedCheck className="size-3 shrink-0" />
                    <span className="truncate" style={{ color: X.muted }}>@{t.handle}</span>
                    <span style={{ color: X.muted }}>·</span>
                    <span className="shrink-0" style={{ color: X.muted }}>{t.ago}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: X.text }}>
                    {t.text}
                  </p>
                  <div className="mt-2 flex items-center justify-between max-w-[220px] text-[10px]" style={{ color: X.muted }}>
                    <span className="inline-flex items-center gap-1.5">
                      <ReplyIcon className="size-[13px]" />
                      {4 + i}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <RepostIcon className="size-[13px]" />
                      {7 + i}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <LikeIcon className="size-[13px]" />
                      {23 + i}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Gradient fades */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8" style={{ background: `linear-gradient(${X.bg}, transparent)` }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8" style={{ background: `linear-gradient(transparent, ${X.bg})` }} />
      </div>
    </div>
  );
}
