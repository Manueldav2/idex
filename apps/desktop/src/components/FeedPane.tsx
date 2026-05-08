import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFeed } from "@/store/feed";
import { useSettings } from "@/store/settings";
import { Card } from "./Card";
import {
  Bell,
  Bookmark,
  CircleEllipsis,
  Home,
  Mail,
  Search,
  User,
  Users,
  X as CloseIcon,
} from "lucide-react";

/** X divider color — used in header/divider lines to match the card chrome. */
// Match cockpit `--color-ink-0` so the X surface (peek strip + expanded
// pane) blends seamlessly with the IDE chrome — no visible bezel between
// the agent terminal and the feed.
const X_BG = "#1e1e1e";
// Softer divider that reads against ink-0 background instead of pure black.
const X_DIVIDER = "#2a2a2a";
const X_MUTED = "#71767b";
const X_TEXT = "#e7e9ea";
// Slight lift above ink-0 (#1e1e1e) so the "What's happening" / "Who to
// follow" cards still read as cards, not a flat plane.
const X_PANEL = "#252526";
const X_BLUE = "#1d9bf0";

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

  // Count source-origin mix for the curator indicator.
  const sourceMix = countSources(cards);

  if (!config.feedEnabled) {
    return (
      <aside
        style={{ width: "40px", flexShrink: 0, background: X_BG, borderLeft: `1px solid ${X_DIVIDER}` }}
        className="flex items-center justify-center"
      >
        <button
          onClick={() => useSettings.getState().patch({ feedEnabled: true })}
          className="hover:text-white -rotate-90 origin-center text-[12px] tracking-[-0.005em] whitespace-nowrap transition-colors"
          title="Enable feed"
          style={{ color: X_MUTED }}
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
        background: X_BG,
      }}
      className="flex flex-col overflow-hidden"
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
            <div className="mx-auto flex h-full w-full max-w-[1265px] justify-center">
              <XNav onCollapse={() => setState("peek")} />

              <section
                className="flex h-full w-full max-w-[600px] flex-col md:w-[600px] md:max-w-none"
                style={{
                  borderLeft: `1px solid ${X_DIVIDER}`,
                  borderRight: `1px solid ${X_DIVIDER}`,
                  background: X_BG,
                }}
              >
                {/* Sticky X home timeline header. */}
                <header
                  className="sticky top-0 z-10"
                  style={{
                    borderBottom: `1px solid ${X_DIVIDER}`,
                    background: "rgba(0,0,0,0.65)",
                    WebkitBackdropFilter: "blur(12px)",
                    backdropFilter: "blur(12px)",
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
              </section>

              <XRightRail
                isLoading={isLoading}
                mix={sourceMix}
                total={cards.length}
                onCollapse={() => setState("peek")}
              />
            </div>
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
      className="x-tab relative flex-1 min-w-[100px] flex items-center justify-center transition-colors"
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
            background: X_BLUE,
          }}
        />
      )}
    </button>
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
        <span className="dot-soft-pulse size-2 rounded-full" style={{ background: X_BLUE }} />
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
            background: X_PANEL,
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
      className="w-full h-full flex flex-col items-center justify-between py-5 group hover:bg-white/[0.03] transition-colors overflow-hidden"
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
          className="size-[22px] text-[#e7e9ea] group-hover:text-[#1d9bf0] transition-colors"
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
          <span className="text-[11px] font-mono text-[#71767b] group-hover:text-[#e7e9ea] transition-colors tracking-wide whitespace-nowrap truncate">
            {primary}
            {secondary && <span className="text-[#71767b] mx-2">·</span>}
            {secondary && <span className="text-[#71767b]">{secondary}</span>}
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
            <span className="dot-soft-pulse size-1 rounded-full" style={{ animationDelay: "0ms", background: X_BLUE }} />
            <span className="dot-soft-pulse size-1 rounded-full" style={{ animationDelay: "180ms", background: X_BLUE }} />
            <span className="dot-soft-pulse size-1 rounded-full" style={{ animationDelay: "360ms", background: X_BLUE }} />
          </>
        ) : (
          <span className="size-1 rounded-full" style={{ background: X_MUTED }} />
        )}
      </div>
    </button>
  );
}

function XLogo({ className = "size-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function XNav({ onCollapse }: { onCollapse: () => void }) {
  const open = (path: string) => () => void window.idex.openExternal(`https://x.com${path}`);
  return (
    <nav className="hidden h-full w-[275px] shrink-0 flex-col px-3 pt-1 text-[20px] text-white lg:flex">
      <button
        onClick={open("/home")}
        className="mb-2 flex h-[50px] w-[50px] items-center justify-center rounded-full hover:bg-white/10"
        title="Open X"
      >
        <XLogo className="size-[26px]" />
      </button>
      <XNavItem icon={<Home className="size-[26px]" />} label="Home" active onClick={open("/home")} />
      <XNavItem icon={<Search className="size-[26px]" />} label="Explore" onClick={open("/explore")} />
      <XNavItem icon={<Bell className="size-[26px]" />} label="Notifications" onClick={open("/notifications")} />
      <XNavItem icon={<Mail className="size-[26px]" />} label="Messages" onClick={open("/messages")} />
      <XNavItem icon={<Bookmark className="size-[26px]" />} label="Bookmarks" onClick={open("/i/bookmarks")} />
      <XNavItem icon={<Users className="size-[26px]" />} label="Communities" onClick={open("/i/communities")} />
      <XNavItem icon={<User className="size-[26px]" />} label="Profile" onClick={open("/i/profile")} />
      <XNavItem icon={<CircleEllipsis className="size-[26px]" />} label="More" onClick={open("/settings")} />
      <button
        onClick={open("/compose/post")}
        className="press-feedback mt-4 h-[52px] w-[90%] rounded-full text-[17px] font-bold text-white transition-colors hover:brightness-95"
        style={{ background: X_BLUE }}
      >
        Post
      </button>
      <button
        onClick={onCollapse}
        className="mt-auto mb-4 flex w-full items-center gap-3 rounded-full px-3 py-3 text-left text-[15px] transition-colors hover:bg-white/10"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
          <CloseIcon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-bold leading-5">IDEX</span>
          <span className="truncate text-[15px] leading-5" style={{ color: X_MUTED }}>
            Return to app
          </span>
        </span>
      </button>
    </nav>
  );
}

function XNavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="press-feedback flex w-fit items-center gap-5 rounded-full px-3 py-3 transition-colors hover:bg-white/10"
      title={`Open ${label} on X`}
    >
      <span>{icon}</span>
      <span className={active ? "font-bold" : "font-normal"}>{label}</span>
    </button>
  );
}

function XRightRail({
  isLoading,
  mix,
  total,
  onCollapse,
}: {
  isLoading: boolean;
  mix: { hn: number; reddit: number; starter: number; other: number };
  total: number;
  onCollapse: () => void;
}) {
  return (
    <aside className="hidden h-full w-[390px] shrink-0 px-[30px] py-1 xl:block">
      <div
        className="sticky top-0 z-10 flex h-[53px] items-center gap-3"
        style={{ background: X_BG }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement | null)?.value?.trim();
            if (!q) return;
            void window.idex.openExternal(`https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query`);
          }}
          className="flex h-11 flex-1 items-center gap-3 rounded-full px-4"
          style={{ background: "#202327", color: X_MUTED }}
        >
          <Search className="size-[18px]" />
          <input
            name="q"
            type="text"
            placeholder="Search X"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-[15px]"
            style={{ color: X_TEXT }}
          />
        </form>
        <button
          onClick={onCollapse}
          className="x-header-btn flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
          title="Collapse feed"
          aria-label="Collapse feed"
          style={{ color: X_MUTED }}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <section
        className="mt-3 overflow-hidden rounded-2xl"
        style={{ background: X_PANEL, color: X_TEXT }}
      >
        <h2 className="px-4 pb-2 pt-3 text-[20px] font-extrabold leading-6">
          What&apos;s happening
        </h2>
        <TrendRow eyebrow="Live" title="Curated while your agent works" meta={isLoading ? "Updating now" : "Ready"} />
        <TrendRow eyebrow="Sources" title={`${total} posts in this feed`} meta={`${mix.hn} HN · ${mix.reddit} Reddit · ${mix.starter + mix.other} seed`} />
        <TrendRow eyebrow="Developer news" title="Context matched to your prompt" meta="Personalized by IDEX" />
      </section>

      <section
        className="mt-4 overflow-hidden rounded-2xl"
        style={{ background: X_PANEL, color: X_TEXT }}
      >
        <h2 className="px-4 pb-2 pt-3 text-[20px] font-extrabold leading-6">
          Who to follow
        </h2>
        <FollowRow name="Claude Code" handle="@anthropic" />
        <FollowRow name="OpenAI Codex" handle="@openai" />
        <FollowRow name="IDEX" handle="@idex" />
      </section>
    </aside>
  );
}

function TrendRow({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <button className="block w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03]">
      <div className="text-[13px] leading-4" style={{ color: X_MUTED }}>
        {eyebrow}
      </div>
      <div className="mt-0.5 text-[15px] font-bold leading-5" style={{ color: X_TEXT }}>
        {title}
      </div>
      <div className="mt-0.5 text-[13px] leading-4" style={{ color: X_MUTED }}>
        {meta}
      </div>
    </button>
  );
}

function FollowRow({ name, handle }: { name: string; handle: string }) {
  const cleanHandle = handle.replace(/^@/, "");
  return (
    <button
      onClick={() => void window.idex.openExternal(`https://x.com/${cleanHandle}`)}
      className="press-feedback flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      title={`Open ${handle} on X`}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-black text-black">
        {name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold leading-5" style={{ color: X_TEXT }}>
          {name}
        </div>
        <div className="truncate text-[15px] leading-5" style={{ color: X_MUTED }}>
          {handle}
        </div>
      </div>
      <span
        className="rounded-full bg-white px-4 py-1.5 text-[14px] font-bold text-black"
        onClick={(e) => {
          e.stopPropagation();
          void window.idex.openExternal(`https://x.com/${cleanHandle}`);
        }}
      >
        Follow
      </span>
    </button>
  );
}
