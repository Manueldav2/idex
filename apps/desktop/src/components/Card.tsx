import type { Card as CardType } from "@idex/types";
import {
  BarChart2,
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share2,
} from "lucide-react";

/**
 * X-palette tokens. Hard-coded so the card chrome is insulated from the
 * rest of the app's design system — this pane is meant to feel like the
 * real X (Twitter) client, not like IDEX. Primary bg is still our ink-0.
 */
const X = {
  text: "#e7e9ea",
  muted: "#71767b",
  divider: "#2f3336",
  hover: "rgba(255,255,255,0.03)",
  like: "#f91880",
  retweet: "#00ba7c",
  reply: "#1d9bf0",
} as const;

/** Source-origin chip shown next to the timestamp. Starter cards show nothing. */
function sourceBadge(card: CardType): { label: string; bg: string } | null {
  switch (card.source) {
    case "hackernews":
      return { label: "HN", bg: "#ff6600" };
    case "reddit": {
      // Try to pluck a sub from the URL if one is present.
      const m = /reddit\.com\/r\/([A-Za-z0-9_]+)/i.exec(card.url);
      const sub = m?.[1];
      return { label: sub ? `r/${sub}` : "r/reddit", bg: "#ff4500" };
    }
    case "ad":
      return { label: "AD", bg: "#71767b" };
    case "twitter":
    case "starter":
    default:
      return null;
  }
}

/** Fallback avatar background color — matches the source chip tone. */
function avatarBg(card: CardType): string {
  switch (card.source) {
    case "hackernews":
      return "#ff6600";
    case "reddit":
      return "#ff4500";
    case "twitter":
      return "#1d9bf0";
    case "ad":
      return "#71767b";
    case "starter":
    default:
      return "#3d7bff"; // our accent — starter cards look "organic"
  }
}

export function Card({
  card,
  focused: _focused,
  shimmer = false,
}: {
  card: CardType;
  focused: boolean;
  /** When true, overlay a subtle accent-tinted shimmer to signal a live
   *  fetch is in flight replacing this starter card. */
  shimmer?: boolean;
}) {
  const fb = card.fallback;
  const open = () => void window.idex.openExternal(card.url);
  const badge = sourceBadge(card);

  // Realistic-looking engagement counts derived from the curator score.
  const likes = Math.floor(card.score * 420) + 12;
  const retweets = Math.floor(likes / 4);
  const replies = Math.floor(likes / 11);
  const views = likes * 18;

  // Some "verified" heuristic — treat twitter-source cards as verified so
  // the blue check appears in-context. Starter/HN/Reddit get nothing.
  const verified = card.source === "twitter";

  const displayName = fb?.author?.name ?? "Unknown";
  const handle = fb?.author?.handle?.replace(/^@/, "") ?? "anon";
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <article
      className="x-card relative w-full px-4 py-3 cursor-pointer"
      onClick={open}
      style={{ borderBottom: `1px solid ${X.divider}` }}
    >
      {shimmer && (
        <div aria-hidden className="card-shimmer absolute inset-0" />
      )}

      <div className="flex items-start gap-3">
        {/* Avatar — 48px round, absolute-feeling left column */}
        <div className="shrink-0 pt-0.5">
          {fb?.author?.avatarUrl ? (
            <img
              src={fb.author.avatarUrl}
              alt=""
              className="size-12 rounded-full bg-ink-2 object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div
              className="size-12 rounded-full flex items-center justify-center text-[18px] font-bold text-white select-none"
              style={{ background: avatarBg(card) }}
            >
              {initial}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-0">
          {/* Row 1 — name · check · @handle · · · time · … */}
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="font-semibold text-[15px] leading-[1.2] truncate"
              style={{ color: X.text }}
            >
              {displayName}
            </span>

            {verified && (
              <VerifiedCheck />
            )}

            {badge && (
              <span
                className="shrink-0 text-[10.5px] font-semibold px-1.5 py-[1px] rounded leading-none text-white tracking-wide"
                style={{ background: badge.bg }}
                title={card.source}
              >
                {badge.label}
              </span>
            )}

            <span
              className="text-[15px] leading-[1.2] truncate"
              style={{ color: X.muted }}
            >
              @{handle}
            </span>
            <span className="text-[15px] leading-[1.2]" style={{ color: X.muted }}>
              ·
            </span>
            <span
              className="text-[15px] leading-[1.2] shrink-0"
              style={{ color: X.muted }}
              title={fb?.createdAt}
            >
              {fb?.createdAt ? timeAgo(fb.createdAt) : "now"}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              className="x-icon-btn ml-auto -my-1 -mr-1 shrink-0"
              style={{ color: X.muted }}
              title="More"
              aria-label="More"
            >
              <MoreHorizontal className="size-[18px]" strokeWidth={1.75} />
            </button>
          </div>

          {/* Row 2 — body */}
          {fb?.text && (
            <p
              className="mt-[2px] text-[15px] whitespace-pre-wrap break-words"
              style={{
                color: X.text,
                lineHeight: 1.3125,
              }}
            >
              {fb.text}
            </p>
          )}

          {/* Row 3 — media */}
          {fb?.media && fb.media.length > 0 && fb.media[0]!.kind === "image" && (
            <div
              className="mt-3 rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${X.divider}` }}
            >
              <img
                src={fb.media[0]!.url}
                alt={fb.media[0]!.alt ?? ""}
                className="w-full object-cover"
                style={{ maxHeight: "510px" }}
                loading="lazy"
                draggable={false}
              />
            </div>
          )}

          {/* Row 4 — action bar */}
          <div className="mt-3 flex items-center justify-between max-w-[425px] -ml-2">
            <Action
              Icon={MessageCircle}
              count={replies}
              hoverColor={X.reply}
              hoverBg="rgba(29,155,240,0.1)"
              label="Reply"
              onClick={open}
            />
            <Action
              Icon={Repeat2}
              count={retweets}
              hoverColor={X.retweet}
              hoverBg="rgba(0,186,124,0.1)"
              label="Repost"
              onClick={open}
            />
            <Action
              Icon={Heart}
              count={likes}
              hoverColor={X.like}
              hoverBg="rgba(249,24,136,0.1)"
              label="Like"
              onClick={open}
            />
            <Action
              Icon={BarChart2}
              count={views}
              hoverColor={X.reply}
              hoverBg="rgba(29,155,240,0.1)"
              label="Views"
              onClick={open}
            />
            <Action
              Icon={Bookmark}
              hoverColor={X.reply}
              hoverBg="rgba(29,155,240,0.1)"
              label="Bookmark"
              onClick={open}
            />
            <Action
              Icon={Share2}
              hoverColor={X.reply}
              hoverBg="rgba(29,155,240,0.1)"
              label="Share"
              onClick={open}
            />
          </div>

          {/* Relevance — kept, but toned way down. No "why —" label shouting. */}
          {card.relevanceReason && (
            <div
              className="mt-2 text-[12px] leading-snug italic"
              style={{ color: X.muted }}
            >
              {card.relevanceReason}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Inline verified check — small blue twitter-style badge. */
function VerifiedCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[16px] shrink-0"
      aria-label="Verified account"
      style={{ color: X.reply }}
    >
      <path
        fill="currentColor"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
      />
    </svg>
  );
}

type ActionProps = {
  Icon: typeof Heart;
  count?: number;
  hoverColor: string;
  hoverBg: string;
  label: string;
  onClick: () => void;
};

function Action({ Icon, count, hoverColor, hoverBg, label, onClick }: ActionProps) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="x-action group/action flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
      style={
        {
          color: X.muted,
          // CSS custom props consumed by the hover class below.
          ["--x-hover" as string]: hoverColor,
          ["--x-hover-bg" as string]: hoverBg,
        } as React.CSSProperties
      }
    >
      <span
        className="x-action__icon rounded-full p-1.5 -m-1.5 transition-colors flex items-center justify-center"
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      {typeof count === "number" && (
        <span className="text-[13px] leading-none tabular-nums">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1_000_000) return Math.floor(n / 1000) + "K";
  if (n < 10_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return Math.floor(n / 1_000_000) + "M";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "now";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return `${Math.floor(sec / 604800)}w`;
}
