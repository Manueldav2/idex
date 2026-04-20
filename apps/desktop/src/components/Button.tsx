import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "secondary" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:brightness-110 active:brightness-95 shadow-[0_4px_12px_rgba(61,123,255,0.25)]",
  secondary:
    "bg-ink-2 text-text-primary hover:bg-[#23262f] border border-line",
  ghost:
    "bg-transparent text-text-primary hover:bg-ink-2 border border-line",
  danger: "bg-error text-white hover:brightness-110",
};

const sizeClass: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[12px] rounded-md",
  md: "px-3.5 py-1.5 text-[13px] rounded-lg",
  lg: "px-5 py-2.5 text-[14px] rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "press-feedback inline-flex items-center justify-center gap-1.5 font-display font-semibold tracking-tight",
        "focus:outline-none focus:ring-2 focus:ring-accent-soft focus:ring-offset-2 focus:ring-offset-ink-0",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
