import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { ChevronDown, Plus, X } from "lucide-react";
import { useAgent, type SessionData } from "@/store/agent";
import { useWorkspace } from "@/store/workspace";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/cn";

/**
 * Cursor-style integrated terminal. Lives at the bottom of editor mode,
 * hosts one or more shell sessions (a real zsh/bash/fish running against
 * the open workspace). Toggled by ⌘` and the chevron in its header.
 *
 * Architecture: reuses the agent-host PTY infrastructure via a dedicated
 * "shell" AgentId, so we get session spawn / kill / resize / output
 * streaming for free. Sessions whose agentId === "shell" are filtered
 * out of the main SessionTabs and shown here instead.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  onHeight?: (h: number) => void;
}

const MIN_HEIGHT = 160;
const MAX_HEIGHT_RATIO = 0.66;
const DEFAULT_HEIGHT = 300;

export function TerminalPanel({ open, onClose, onHeight }: Props) {
  const sessions = useAgent((s) => s.sessions);
  const order = useAgent((s) => s.order);
  const activeId = useAgent((s) => s.activeId);
  const createSession = useAgent((s) => s.createSession);
  const closeSession = useAgent((s) => s.closeSession);
  const setActive = useAgent((s) => s.setActive);
  const workspacePath = useWorkspace((s) => s.workspacePath);

  // Only show shell sessions in this panel — the SessionTabs up top
  // handles AI agent sessions.
  const shellIds = useMemo(
    () => order.filter((id) => sessions[id]?.session.agentId === "shell"),
    [order, sessions],
  );

  const [activeShellId, setActiveShellId] = useState<string | null>(null);

  // If the global activeId happens to be a shell, mirror it locally so
  // the tab indicator tracks ⌘1-9 navigation from other surfaces too.
  useEffect(() => {
    if (activeId && sessions[activeId]?.session.agentId === "shell") {
      setActiveShellId(activeId);
    }
  }, [activeId, sessions]);

  // Fall back to the most-recent shell if the picked one is gone.
  useEffect(() => {
    if (!activeShellId || !sessions[activeShellId]) {
      setActiveShellId(shellIds[shellIds.length - 1] ?? null);
    }
  }, [activeShellId, shellIds, sessions]);

  // Auto-spawn a first shell the first time the panel opens if there's
  // none yet. Without this the user sees "nothing here yet" which feels
  // like a broken feature in disguise.
  useEffect(() => {
    if (!open) return;
    if (shellIds.length === 0) {
      void createSession({ agentId: "shell", cwd: workspacePath ?? undefined });
    }
  }, [open, shellIds.length, createSession, workspacePath]);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag-to-resize (grab the top edge). Match Cursor's feel — snap to a
  // min, clamp to 66% of available viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = el.querySelector<HTMLElement>("[data-resize-handle]");
    if (!handle) return;
    let dragStartY = 0;
    let startHeight = 0;
    let dragging = false;

    const onDown = (e: PointerEvent) => {
      dragStartY = e.clientY;
      startHeight = height;
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      document.body.style.cursor = "row-resize";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = dragStartY - e.clientY;
      const next = Math.max(
        MIN_HEIGHT,
        Math.min(startHeight + delta, window.innerHeight * MAX_HEIGHT_RATIO),
      );
      setHeight(next);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.body.style.cursor = "";
    };

    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    return () => {
      handle.removeEventListener("pointerdown", onDown);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
  }, [height]);

  useEffect(() => {
    onHeight?.(open ? height : 0);
  }, [open, height, onHeight]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="shrink-0 flex flex-col border-t border-line bg-ink-0 relative"
    >
      {/* Drag handle — a transparent strip sitting on top of the border
          that shows a row-resize cursor on hover. */}
      <div
        data-resize-handle
        className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-10"
      />

      {/* Header bar */}
      <div className="flex items-stretch h-9 border-b border-line bg-ink-1/70 shrink-0">
        <div className="flex items-stretch gap-0.5 overflow-x-auto pl-3 pr-2 flex-1 min-w-0">
          {shellIds.map((id, idx) => {
            const s = sessions[id];
            if (!s) return null;
            const active = id === activeShellId;
            return (
              <TerminalTab
                key={id}
                label={shortShellLabel(s, idx)}
                active={active}
                onClick={() => {
                  setActiveShellId(id);
                  setActive(id);
                }}
                onClose={() => void closeSession(id)}
              />
            );
          })}
          <button
            onClick={() => {
              void createSession({ agentId: "shell", cwd: workspacePath ?? undefined });
            }}
            title="New terminal"
            className="press-feedback shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-text-tertiary hover:text-accent hover:bg-accent-soft transition-colors self-center"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <button
          onClick={onClose}
          title="Hide terminal (⌘`)"
          className="press-feedback inline-flex items-center justify-center px-3 text-text-tertiary hover:text-text-primary hover:bg-ink-2/60 transition-colors border-l border-line"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {/* Body — one ShellView per shell session, display:none when inactive
          so scrollback persists across tab switches. */}
      <div className="flex-1 min-h-0 relative bg-ink-0">
        {shellIds.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-text-tertiary tracking-[-0.005em]">
            Starting shell…
          </div>
        ) : (
          shellIds.map((id) => {
            const s = sessions[id];
            if (!s) return null;
            return <ShellView key={id} data={s} active={id === activeShellId} />;
          })
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── *
 * Tab                                        *
 * ────────────────────────────────────────── */

function TerminalTab({
  label,
  active,
  onClick,
  onClose,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-1.5 px-2.5 rounded-md text-[12.5px] cursor-pointer transition-colors shrink-0 tracking-[-0.005em] self-center py-1",
        active
          ? "bg-ink-2 text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-ink-2/60",
      )}
    >
      <span className="size-[5px] rounded-full bg-accent/80" />
      <span className="truncate max-w-[180px]">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 hover:bg-ink-0 rounded p-0.5 transition-opacity"
        aria-label="Close terminal"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────── *
 * ShellView — xterm bound to a shell session *
 * ────────────────────────────────────────── */

function shortShellLabel(data: SessionData, idx: number): string {
  // The agent-host labels sessions like "Shell · paradigm_corrupted/paradigm".
  // For the tab we want just the tail so many shells fit side-by-side.
  const label = data.session.label;
  const parts = label.split("·").map((p) => p.trim());
  return parts[parts.length - 1] || `shell ${idx + 1}`;
}

function ShellView({ data, active }: { data: SessionData; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const sessionId = data.session.id;

  useEffect(() => {
    if (!containerRef.current) return;

    // VS Code terminal config — see SessionView for the source links.
    const term = new XTerm({
      fontFamily: "'IdexMono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1,
      letterSpacing: 0,
      fontWeight: "normal",
      fontWeightBold: "bold",
      minimumContrastRatio: 4.5,
      drawBoldTextInBrightColors: false,
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      scrollback: 8000,
      smoothScrollDuration: 0,
      customGlyphs: true,
      theme: {
        background: "#0B0C10",
        foreground: "#EEF0F3",
        cursor: "#3D7BFF",
        cursorAccent: "#0B0C10",
        selectionBackground: "rgba(61,123,255,0.22)",
        black: "#0B0C10",
        red: "#FF6B6B",
        green: "#5EEAD4",
        yellow: "#FBBF24",
        blue: "#3D7BFF",
        magenta: "#A78BFA",
        cyan: "#22D3EE",
        white: "#EEF0F3",
        brightBlack: "#8A91A2",
        brightWhite: "#FFFFFF",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("[idex] WebGL renderer unavailable for shell, using canvas", e);
    }
    fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    const reportResize = () => {
      try {
        const { cols, rows } = term;
        void ipc().agent.resize({ sessionId, cols, rows });
      } catch {
        /* ignore */
      }
    };
    reportResize();

    const offOutput = ipc().agent.onOutput((chunk) => {
      if (chunk.sessionId !== sessionId) return;
      term.write(chunk.raw);
    });

    const onTermData = term.onData((d) => {
      if (!activeRef.current) return;
      void ipc().agent.input({ sessionId, text: d });
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        reportResize();
      } catch {
        /* ignore */
      }
    });
    ro.observe(containerRef.current);

    if (active) setTimeout(() => term.focus(), 50);

    return () => {
      offOutput();
      onTermData.dispose();
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      const id = setTimeout(() => {
        try {
          fitRef.current?.fit();
          xtermRef.current?.focus();
        } catch {
          /* ignore */
        }
      }, 40);
      return () => clearTimeout(id);
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      onClick={() => xtermRef.current?.focus()}
      style={{ display: active ? "block" : "none" }}
      className="absolute inset-0 px-3 py-2 cursor-text"
    />
  );
}
