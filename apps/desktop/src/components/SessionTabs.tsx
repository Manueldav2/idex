import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import type { AgentId, AgentState } from "@idex/types";
import { Plus, X } from "lucide-react";

function dotClass(state: AgentState): string {
  switch (state) {
    // Generating gets a tasteful pulsing halo via box-shadow (see .dot-halo-pulse
    // in index.css). No bouncy animate-pulse on the dot itself.
    case "generating": return "bg-accent dot-halo-pulse";
    case "spawning": return "bg-accent dot-halo-pulse";
    case "error": return "bg-error";
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

  const onNew = async () => {
    const agentId: AgentId = "claude-code";
    await createSession({ agentId });
  };

  return (
    <div className="glass draggable flex items-center gap-1 border-b border-line pl-24 pr-2 h-11 shrink-0 overflow-x-auto no-drag-children">
      {order.map((id, idx) => {
        const sd = sessions[id];
        if (!sd) return null;
        const active = id === activeId;
        return (
          <div
            key={id}
            onClick={() => setActive(id)}
            className={`no-drag group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-mono cursor-pointer transition-colors shrink-0 ${
              active
                ? "bg-ink-2 text-text-primary border border-line"
                : "text-text-secondary hover:text-text-primary hover:bg-ink-2/50 border border-transparent"
            }`}
          >
            <span className={`size-1.5 rounded-full ${dotClass(sd.session.state)}`} />
            <span className="max-w-[240px] truncate">{sd.session.label}</span>
            <span className="text-text-secondary/60 text-[10px]">#{idx + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void closeSession(id);
              }}
              className="tt opacity-0 group-hover:opacity-100 hover:bg-ink-1 rounded p-0.5 transition-opacity"
              data-tooltip="close (⌘W)"
              data-tooltip-pos="bottom"
              aria-label="Close session"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        onClick={() => void onNew()}
        className="tt no-drag press-feedback shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-mono text-text-secondary hover:text-accent hover:bg-accent-soft transition-colors"
        data-tooltip="new session (⌘T)"
        data-tooltip-pos="bottom"
        aria-label="New Claude Code session"
      >
        <Plus className="size-3.5" /> new
      </button>
      {order.length === 0 && (
        <span className="text-[11px] text-text-secondary font-mono ml-2">
          click <span className="text-accent">+ new</span> or press ⌘T to start
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
          <div className="rounded-lg border border-line bg-ink-1/95 backdrop-blur-md px-3.5 py-2.5 text-[11px] font-mono text-text-secondary leading-relaxed shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <span className="text-text-primary">
              <kbd className="px-1 py-0.5 rounded border border-line">⌘T</kbd>
            </span>
            <span className="mx-1.5">for a new session</span>
            <span className="opacity-50">·</span>
            <span className="mx-1.5">
              <kbd className="px-1 py-0.5 rounded border border-line text-text-primary">⌘K</kbd> for commands
            </span>
            <span className="opacity-50 text-[10px]">(soon)</span>
            <span className="opacity-50 mx-1.5">·</span>
            <span>
              <kbd className="px-1 py-0.5 rounded border border-line text-text-primary">⌘E</kbd> for editor mode
            </span>
            <span className="opacity-50 text-[10px]"> (soon)</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
