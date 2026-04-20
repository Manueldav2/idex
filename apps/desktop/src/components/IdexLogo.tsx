import { cn } from "@/lib/cn";

export function IdexLogo({ className, glow }: { className?: string; glow?: boolean }) {
  return (
    <pre
      className={cn(
        "font-mono text-[10px] leading-[10px] select-none",
        glow ? "text-accent" : "text-text-secondary",
        className,
      )}
    >
{`  ┌──────────────┐
  │   I D E X    │
  └──────────────┘`}
    </pre>
  );
}
