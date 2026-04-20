import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { useAutopilot } from "@/store/autopilot";
import { cn } from "@/lib/cn";

/**
 * The pre-flight surface shown when the cockpit is in autopilot mode but no
 * goal has been entered yet. A single textarea + primary CTA — the entire
 * value proposition collapses to "say what you want built."
 */
export function AutopilotLauncher() {
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const error = useAutopilot((s) => s.error);
  const start = useAutopilot((s) => s.start);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus so the user can just start typing.
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  const canSubmit = goal.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await start(goal);
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘↵ / Ctrl↵ submits — matches the pattern users know from chat apps.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-[640px]"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="text-[10px] uppercase tracking-[0.24em] font-mono text-text-secondary">
            autopilot
          </span>
        </div>

        <h1
          className="font-display text-text-primary"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            fontSize: "56px",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            fontWeight: 400,
          }}
        >
          What do you want to build?
        </h1>
        <p className="mt-4 text-text-secondary text-[14px] leading-relaxed max-w-[520px]">
          It'll plan, research, and work on it while you scroll.
        </p>

        <div className="mt-8">
          <textarea
            ref={textareaRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={onKeyDown}
            rows={4}
            placeholder="build me a minimal markdown editor with live preview, dark theme, and keyboard shortcuts for bold/italic…"
            className={cn(
              "w-full resize-none rounded-xl bg-ink-1 border border-line px-4 py-3.5",
              "text-text-primary placeholder:text-text-secondary/60",
              "focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent-soft transition-colors",
            )}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              lineHeight: 1.55,
            }}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="mt-3 text-[12px] text-error font-mono leading-relaxed">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-[11px] font-mono text-text-secondary/70">
            stay scrolling. cancel anytime with{" "}
            <kbd className="px-1.5 py-0.5 rounded border border-line text-text-secondary">
              ⌘.
            </kbd>
          </span>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className={cn(
              "press-feedback inline-flex items-center gap-2 rounded-lg px-4 py-2",
              "text-[13px] font-display font-semibold tracking-tight",
              "bg-accent text-white shadow-[0_4px_12px_rgba(61,123,255,0.25)]",
              "hover:brightness-110 active:brightness-95 transition-[filter]",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            <Rocket className="size-3.5" />
            {submitting ? "starting…" : "Run autopilot"}
            <span className="ml-1 opacity-60 text-[10px] font-mono">⌘↵</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
