import type { Card as CardType } from "@idex/types";
import { ExternalLink, Heart, MessageCircle, Repeat2, BarChart2 } from "lucide-react";

function sourceChip(source: CardType["source"]): { label: string; klass: string } {
  switch (source) {
    case "hackernews": return { label: "HN", klass: "bg-[#ff6600] text-white" };
    case "reddit": return { label: "r/", klass: "bg-[#ff4500] text-white" };
    case "twitter": return { label: "X", klass: "bg-accent text-white" };
    case "ad": return { label: "AD", klass: "bg-text-secondary/30 text-text-secondary" };
    case "starter":
    default: return { label: "★", klass: "bg-ink-2 text-text-secondary" };
  }
}

export function Card({
  card,
  focused,
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
  const chip = sourceChip(card.source);

  const approxCounts = Math.floor(card.score * 180) + 17;

  return (
    <article
      className={`relative w-full px-6 py-4 transition-colors cursor-pointer ${
        focused ? "" : "opacity-80 hover:opacity-100"
      }`}
      onClick={open}
    >
      {shimmer && (
        <div aria-hidden className="card-shimmer absolute inset-0 rounded" />
      )}
      <div className="flex items-start gap-3">
        {fb?.author?.avatarUrl ? (
          <img src={fb.author.avatarUrl} alt="" className="size-10 rounded-full shrink-0 bg-ink-2" loading="lazy" />
        ) : (
          <div className={`size-10 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold ${chip.klass}`}>
            {fb?.author?.name?.[0]?.toUpperCase() ?? chip.label}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-display font-semibold text-text-primary text-[14px] truncate">
              {fb?.author?.name ?? "Unknown"}
            </span>
            <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${chip.klass}`}>
              {chip.label}
            </span>
            <span className="text-text-secondary text-[12.5px] truncate">
              @{fb?.author?.handle?.replace(/^@/, "") ?? "anon"}
            </span>
            <span className="text-text-secondary text-[12.5px]">·</span>
            <span className="text-text-secondary text-[12.5px]">
              {fb?.createdAt ? timeAgo(fb.createdAt) : "now"}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); open(); }}
              className="ml-auto p-1 rounded hover:bg-ink-2 text-text-secondary"
              title="Open source"
            >
              <ExternalLink className="size-3.5" />
            </button>
          </div>

          {fb?.text && (
            <p className="mt-1 text-[14.5px] leading-[1.38] text-text-primary whitespace-pre-wrap break-words">
              {fb.text}
            </p>
          )}

          {fb?.media && fb.media.length > 0 && fb.media[0]!.kind === "image" && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-line">
              <img
                src={fb.media[0]!.url}
                alt={fb.media[0]!.alt ?? ""}
                className="w-full max-h-[280px] object-cover"
                loading="lazy"
                draggable={false}
              />
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-8 text-text-secondary text-[12px]">
            <IconCount Icon={MessageCircle} n={Math.floor(approxCounts / 4)} />
            <IconCount Icon={Repeat2} n={Math.floor(approxCounts / 3)} />
            <IconCount Icon={Heart} n={approxCounts} />
            <IconCount Icon={BarChart2} n={approxCounts * 12} />
          </div>

          {card.relevanceReason && (
            <div className="mt-2 text-[11px] italic text-text-tertiary leading-snug">
              <span className="text-accent not-italic font-medium">why —</span>{" "}
              {card.relevanceReason}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function IconCount({ Icon, n }: { Icon: typeof Heart; n: number }) {
  return (
    <span className="flex items-center gap-1.5 group/icon hover:text-accent transition-colors">
      <Icon className="size-3.5" />
      <span>{formatCount(n)}</span>
    </span>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
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
