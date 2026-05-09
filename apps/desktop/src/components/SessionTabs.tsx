import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import type { AgentId, AgentState } from "@idex/types";
import { ChevronDown, Plus, X } from "lucide-react";

const AGENT_PICKER_OPTIONS: Array<{ id: AgentId; label: string; sub: string }> = [
  { id: "claude-code", label: "Claude Code", sub: "Anthropic" },
  { id: "codex", label: "Codex", sub: "OpenAI" },
  { id: "freebuff", label: "Freebuff", sub: "free, ad-supported" },
  { id: "codebuff", label: "Codebuff", sub: "paid" },
];

function dotClass(state: AgentState): string {
  switch (state) {
    // Generating gets a tasteful pulsing halo via box-shadow (see .dot-halo-pulse
    // in index.css). No bouncy animate-pulse on the dot itself.
    case "generating": return "bg-accent dot-halo-pulse";
    case "spawning": return "bg-accent dot-halo-pulse";
    case "error": return "bg-error";
    case "exited": return "bg-text-tertiary/60";
    case "done": return "bg-text-secondary";
    default: return "bg-text-secondary/60";
  }
}

export function SessionTabs() {
  const sessions = useAgent((s) => s.sessions);
  const order = useAgent((s) => s.order);
  const activeId = useAgent((s) => s.activeId);
  const setActive = useAgent((s) => s.setActive);
  const createSession = useAgent((s) => s.createSession);
  const closeSession = useAgent((s) => s.closeSession);
  const selectedAgent = useSettings((s) => s.config.selectedAgent);

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen]);

  // Agent-mode tabs never include raw shell sessions — those live in the
  // integrated terminal panel inside editor mode. Filtering here keeps
  // the top tab strip focused on "what AI am I talking to" rather than
  // mixing AI and shell contexts.
  const agentOrder = order.filter((id) => sessions[id]?.session.agentId !== "shell");

  // Default new sessions to whatever the user chose in Settings. The
  // store's createSession will use this as a fallback, but passing it
  // explicitly here means "+" always reflects the picker even if the
  // store ever changes its default.
  const onNew = async (agentId?: AgentId) => {
    await createSession({ agentId: agentId ?? selectedAgent });
  };

  return (
    <div className="draggable flex items-stretch gap-0 border-b border-line bg-ink-1 pl-20 pr-2 h-[35px] shrink-0 overflow-x-auto no-drag-children">
      {agentOrder.map((id, idx) => {
        const sd = sessions[id];
        if (!sd) return null;
        const active = id === activeId;
        return (
          <div
            key={id}
            onClick={() => setActive(id)}
            className={`no-drag group relative flex items-center gap-2 border-r border-line px-3 text-[12px] cursor-pointer transition-colors shrink-0 ${
              active
                ? "bg-ink-0 text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-ink-2"
            }`}
          >
            <span className={`size-[5px] rounded-full ${dotClass(sd.session.state)}`} />
            <span className="max-w-[240px] truncate">{sd.session.label}</span>
            <span className="text-text-tertiary/80 text-[10px] font-mono tabular-nums">
              {idx + 1}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void closeSession(id);
              }}
              className="tt opacity-0 group-hover:opacity-100 hover:bg-ink-2 rounded-[3px] p-0.5 transition-opacity"
              data-tooltip="close (⌘W)"
              data-tooltip-pos="bottom"
              aria-label="Close session"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <div ref={pickerRef} className="relative no-drag flex items-stretch shrink-0">
        <button
          onClick={() => void onNew()}
          className="tt press-feedback shrink-0 inline-flex items-center px-2 text-[13px] text-text-tertiary hover:text-text-primary hover:bg-ink-2 transition-colors"
          data-tooltip="new session (⌘T)"
          data-tooltip-pos="bottom"
          aria-label="New session"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="tt press-feedback shrink-0 inline-flex items-center px-1 text-text-tertiary hover:text-text-primary hover:bg-ink-2 transition-colors border-l border-line/40"
          data-tooltip="pick agent"
          data-tooltip-pos="bottom"
          aria-label="Choose agent for new session"
          aria-expanded={pickerOpen}
        >
          <ChevronDown className="size-3" />
        </button>
        {pickerOpen && (
          <div className="absolute top-full right-0 mt-1 w-[220px] rounded border border-line bg-ink-1/98 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] z-50 overflow-hidden">
            {AGENT_PICKER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setPickerOpen(false);
                  void onNew(opt.id);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors ${
                  selectedAgent === opt.id
                    ? "bg-accent/10 text-text-primary"
                    : "text-text-secondary hover:bg-ink-2 hover:text-text-primary"
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-[10.5px] text-text-tertiary">{opt.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {agentOrder.length === 0 && (
        <span className="text-[12px] text-text-secondary ml-2 self-center">
          Press <kbd className="px-1 py-0.5 rounded-[3px] border border-line text-[10.5px] font-mono">⌘T</kbd> to start a session
        </span>
      )}
      <ShortcutHint />
    </div>
  );
}

/**
 * First-launch floating hint. Shows once per install, 2s after the first
 * session spawns, auto-fades after 6s or on any keypress. Persists
 * `hasSeenShortcutHint` to AppConfig.
 */
function ShortcutHint() {
  const order = useAgent((s) => s.order);
  const hasSeen = useSettings((s) => s.config.hasSeenShortcutHint);
  const patch = useSettings((s) => s.patch);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasSeen || visible || order.length === 0) return;
    const showTimer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(showTimer);
  }, [hasSeen, visible, order.length]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      setVisible(false);
      void patch({ hasSeenShortcutHint: true });
    };
    const autoFade = setTimeout(dismiss, 6000);
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      clearTimeout(autoFade);
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, patch]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="shortcut-hint"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          className="no-drag fixed bottom-6 right-6 z-50 pointer-events-none"
        >
          <div className="rounded border border-line bg-ink-1/95 backdrop-blur-md px-3 py-2 text-[12px] text-text-secondary leading-relaxed shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <kbd className="px-1.5 py-0.5 rounded-[3px] border border-line font-mono text-[10.5px] text-text-primary">⌘T</kbd>
            <span className="mx-2">New session</span>
            <span className="text-text-tertiary/60">·</span>
            <span className="mx-2">
              <kbd className="px-1.5 py-0.5 rounded-[3px] border border-line font-mono text-[10.5px] text-text-primary">⌘K</kbd>{" "}
              Commands
            </span>
            <span className="text-text-tertiary/60">·</span>
            <span className="ml-2">
              <kbd className="px-1.5 py-0.5 rounded-[3px] border border-line font-mono text-[10.5px] text-text-primary">⌘E</kbd>{" "}
              Editor
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
