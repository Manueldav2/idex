import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { XCircle, Send } from "lucide-react";
import { useAutopilot } from "@/store/autopilot";
import { useAgent } from "@/store/agent";
import { useFeed } from "@/store/feed";
import { cn } from "@/lib/cn";

/**
 * AutopilotMode — the working surface shown after the user submits a goal.
 * Renders the 28%-wide control panel; the feed is rendered separately by
 * Cockpit and stays in its expanded/dominant state for the full run.
 */
export function AutopilotMode() {
  const goal = useAutopilot((s) => s.goal);
  const sessionId = useAutopilot((s) => s.sessionId);
  const status = useAutopilot((s) => s.status);
  const startedAt = useAutopilot((s) => s.startedAt);
  const cancel = useAutopilot((s) => s.cancel);
  const inject = useAutopilot((s) => s.inject);

  // Force the feed into its dominant expanded state whenever this mode mounts.
  // The user picked autopilot specifically to scroll — collapsing feels wrong.
  useEffect(() => {
    useFeed.getState().setState("expanded");
  }, []);

  // Narrow the agent-store subscription to just this one session's events so
  // we don't re-render the left panel on unrelated session activity.
  const events = useAgent((s) =>
    sessionId ? s.sessions[sessionId]?.events ?? [] : [],
  );

  // Keep only tail of agent_chunk / user_input lines for the live preview.
  // We split by newline and keep the last ~24 source lines, which then render
  // as the last 8 visually after trimming empty lines.
  const previewLines = useMemo(() => {
    const lines: string[] = [];
    for (const e of events.slice(-40)) {
      if (e.kind === "agent_chunk" || e.kind === "agent_done") {
        for (const ln of e.text.split("\n")) lines.push(ln);
      } else if (e.kind === "user_input") {
        lines.push(`› ${e.text}`);
      }
    }
    return lines.map((l) => l.replace(/\s+$/g, "")).filter((l) => l.length > 0).slice(-80);
  }, [events]);

  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [previewLines.length]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-ink-1">
      {/*
        When autopilot is active the feed takes over the right 75% of the
        window (via FeedPane's expanded state), leaving <main> itself as the
        ~25% left column. We therefore fill the whole main with the control
        panel rather than try to nest another 28%-wide aside inside it.
      */}
      <StatusBar
        status={status}
        startedAt={startedAt}
        onCancel={() => void cancel()}
      />
      <GoalCard goal={goal} />
      <LivePreview scrollRef={previewRef} lines={previewLines} />
      <InjectPanel onInject={(text) => inject(text)} disabled={status !== "running"} />
    </div>
  );
}

/* ────────────────────────────────────────── *
 * Subcomponents                              *
 * ────────────────────────────────────────── */

function StatusBar({
  status,
  startedAt,
  onCancel,
}: {
  status: "idle" | "running" | "paused" | "done" | "error";
  startedAt: number | null;
  onCancel: () => void;
}) {
  const elapsed = useElapsed(startedAt);
  const pill = pillForStatus(status);
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] tracking-[-0.005em]",
            pill.className,
          )}
        >
          <span className={cn("size-1.5 rounded-full", pill.dotClass)} />
          {pill.label}
        </span>
        <span className="text-[11.5px] font-mono text-text-secondary tabular-nums">
          {elapsed}
        </span>
      </div>
      <button
        onClick={onCancel}
        title="Cancel autopilot (⌘.)"
        className="press-feedback inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
      >
        <XCircle className="size-3.5" />
        Cancel
      </button>
    </div>
  );
}

function GoalCard({ goal }: { goal: string | null }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-line">
      <div className="mb-2">
        <span className="text-[11px] text-text-tertiary tracking-[-0.005em]">
          Goal
        </span>
      </div>
      <blockquote
        className="serif border-l-2 border-accent/60 pl-3 py-1 text-text-primary"
        style={{
          fontSize: "19px",
          lineHeight: 1.35,
          letterSpacing: "-0.015em",
        }}
      >
        {goal ?? "—"}
      </blockquote>
    </div>
  );
}

function LivePreview({
  scrollRef,
  lines,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  lines: string[];
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[11px] text-text-tertiary tracking-[-0.005em]">
          Live
        </span>
        <span className="text-[11px] font-mono text-text-tertiary tabular-nums">
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          lineHeight: 1.55,
        }}
      >
        {lines.length === 0 ? (
          <div className="flex items-center gap-2 text-text-secondary/70 text-[11px] font-mono">
            <span className="dot-soft-pulse size-1.5 rounded-full bg-accent" />
            waiting for autopilot to speak…
          </div>
        ) : (
          <div className="space-y-0.5">
            {lines.map((ln, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  ln.startsWith("›")
                    ? "text-accent"
                    : ln.startsWith("HEARTBEAT")
                      ? "text-text-primary font-semibold"
                      : "text-text-secondary",
                )}
              >
                {ln}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InjectPanel({
  onInject,
  disabled,
}: {
  onInject: (text: string) => void | Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canSend = text.trim().length > 0 && !busy && !disabled;

  const handleSend = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await onInject(text);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line bg-ink-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-[12px] text-text-secondary hover:text-text-primary transition-colors tracking-[-0.005em]"
      >
        <span>Inject context</span>
        <span className="text-text-tertiary">
          {open ? "Hide" : "Add"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={3}
            placeholder="actually, prefer tailwind over styled-components…"
            disabled={disabled}
            className={cn(
              "w-full resize-none rounded-lg bg-ink-0 border border-line px-3 py-2",
              "text-text-primary placeholder:text-text-secondary/60",
              "focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent-soft transition-colors",
              "disabled:opacity-50",
            )}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-text-tertiary tracking-[-0.005em]">
              Arrives between the agent's turns
            </span>
            <button
              onClick={() => void handleSend()}
              disabled={!canSend}
              className={cn(
                "press-feedback inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                "text-[12px] font-medium tracking-[-0.01em]",
                "bg-accent text-white hover:brightness-110 transition-[filter]",
                "disabled:opacity-50 disabled:pointer-events-none",
              )}
            >
              <Send className="size-3" />
              Add to task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────── *
 * Helpers                                    *
 * ────────────────────────────────────────── */

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (startedAt === null) return "00:00";
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function pillForStatus(status: "idle" | "running" | "paused" | "done" | "error") {
  switch (status) {
    case "running":
      return {
        label: "Running",
        className: "bg-accent-soft text-accent",
        dotClass: "bg-accent dot-halo-pulse",
      };
    case "paused":
      return {
        label: "Paused",
        className: "bg-ink-2 text-text-secondary",
        dotClass: "bg-text-secondary",
      };
    case "done":
      return {
        label: "Done",
        className: "bg-ink-2 text-text-secondary",
        dotClass: "bg-text-secondary",
      };
    case "error":
      return {
        label: "Error",
        className: "bg-error/15 text-error",
        dotClass: "bg-error",
      };
    default:
      return {
        label: "Idle",
        className: "bg-ink-2 text-text-secondary",
        dotClass: "bg-text-secondary",
      };
  }
}

