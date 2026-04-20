import type { Card as CardType } from "@idex/types";
import { ExternalLink, Heart } from "lucide-react";
import { Button } from "./Button";

export function Card({ card, focused }: { card: CardType; focused: boolean }) {
  const fb = card.fallback;
  const open = () => {
    void window.idex.openExternal(card.url);
  };

  return (
    <article
      className={`card-edge-highlight relative w-full max-w-[420px] rounded-2xl border bg-ink-1 overflow-hidden transition-all duration-300 ${
        focused ? "border-accent shadow-[0_0_0_1px_rgba(61,123,255,0.5),0_24px_60px_rgba(0,0,0,0.4)]" : "border-line opacity-60 scale-[0.97]"
      }`}
    >
      {fb?.media && fb.media.length > 0 && fb.media[0]!.kind === "image" && (
        <img
          src={fb.media[0]!.url}
          alt={fb.media[0]!.alt ?? ""}
          className="w-full h-56 object-cover"
          draggable={false}
        />
      )}

      <div className="p-4">
        {fb?.author && (
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              {fb.author.avatarUrl && (
                <img
                  src={fb.author.avatarUrl}
                  alt=""
                  className="size-8 rounded-full bg-ink-2"
                  loading="lazy"
                />
              )}
              <div className="leading-tight">
                <div className="text-[13px] font-display font-semibold text-text-primary">
                  {fb.author.name}
                </div>
                <div className="text-[11px] text-text-secondary font-mono">
                  @{fb.author.handle}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={open} title="Open in X">
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        )}

        {fb?.text && (
          <p className="text-[13.5px] leading-relaxed text-text-primary whitespace-pre-wrap">
            {fb.text}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] italic text-text-secondary leading-snug">
            <span className="text-accent not-italic font-medium">why this card —</span>{" "}
            {card.relevanceReason}
          </p>
        </div>

        {!card.isAd && (
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" title="Helpful">
              <Heart className="size-3.5" /> Helpful
            </Button>
          </div>
        )}

        {card.isAd && (
          <div className="mt-3 text-[10px] uppercase tracking-wider font-mono text-text-secondary">
            Sponsored · powered by trygravity.ai
          </div>
        )}
      </div>
    </article>
  );
}
