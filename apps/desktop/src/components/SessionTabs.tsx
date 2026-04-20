import { useAgent } from "@/store/agent";
import type { AgentId, AgentState } from "@idex/types";
import { Plus, X } from "lucide-react";

function dotClass(state: AgentState): string {
  switch (state) {
    case "generating": return "bg-accent animate-pulse";
    case "spawning": return "bg-accent animate-pulse";
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
              className="opacity-0 group-hover:opacity-100 hover:bg-ink-1 rounded p-0.5 transition-opacity"
              title="Close session"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        onClick={() => void onNew()}
        className="no-drag press-feedback shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-mono text-text-secondary hover:text-accent hover:bg-accent-soft transition-colors"
        title="New Claude Code session (⌘T)"
      >
        <Plus className="size-3.5" /> new
      </button>
      {order.length === 0 && (
        <span className="text-[11px] text-text-secondary font-mono ml-2">
          click <span className="text-accent">+ new</span> or press ⌘T to start
        </span>
      )}
    </div>
  );
}
