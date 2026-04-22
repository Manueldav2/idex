import { cn } from "@/lib/cn";

/**
 * Wordmark. Fraunces at display optical size — the single serif note in an
 * otherwise sans UI, mirroring the move Linear/Arc/Cursor make (one
 * editorial typographic choice to stop the whole interface from
 * disappearing into generic-tech-sans territory).
 */
export function IdexLogo({ className, glow }: { className?: string; glow?: boolean }) {
  return (
    <span
      className={cn(
        "serif text-[17px] leading-none font-medium tracking-[-0.02em] select-none",
        glow ? "text-accent" : "text-text-primary",
        className,
      )}
    >
      idex
    </span>
  );
}
