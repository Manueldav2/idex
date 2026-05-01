import { cn } from "@/lib/cn";

export function IdexLogo({ className, glow }: { className?: string; glow?: boolean }) {
  return (
    <span
      className={cn(
        "text-[12px] leading-none font-semibold tracking-[0.02em] select-none",
        glow ? "text-accent" : "text-text-primary",
        className,
      )}
    >
      IDEX
    </span>
  );
}
