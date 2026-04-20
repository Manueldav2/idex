import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { SessionData } from "@/store/agent";
import { useAgent } from "@/store/agent";
import { useFeed } from "@/store/feed";
import { ipc } from "@/lib/ipc";

interface Props {
  data: SessionData;
  active: boolean;
}

/**
 * One xterm terminal bound to one session. Mounted once per session, kept
 * mounted (via display:none when inactive) so scrollback persists when the
 * user switches tabs.
 */
export function SessionView({ data, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lineBufferRef = useRef("");
  const sessionId = data.session.id;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.45,
      theme: {
        background: "#0A0B0E",
        foreground: "#F2F4F7",
        cursor: "#3D7BFF",
        cursorAccent: "#0A0B0E",
        selectionBackground: "rgba(61,123,255,0.25)",
        black: "#0A0B0E",
        red: "#FF6B6B",
        green: "#5EEAD4",
        yellow: "#FBBF24",
        blue: "#3D7BFF",
        magenta: "#A78BFA",
        cyan: "#22D3EE",
        white: "#F2F4F7",
        brightBlack: "#8B92A5",
        brightWhite: "#FFFFFF",
      },
      scrollback: 10000,
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    // Resize PTY to match xterm dims
    const reportResize = () => {
      try {
        const { cols, rows } = term;
        void ipc().agent.resize({ sessionId, cols, rows });
      } catch { /* ignore */ }
    };
    reportResize();

    // Listen for output targeted to this session
    const offOutput = ipc().agent.onOutput((chunk) => {
      if (chunk.sessionId !== sessionId) return;
      term.write(chunk.raw);
    });

    // Send xterm keystrokes → PTY (raw). Detect Enter-with-typed-content
    // as a user submission → expand feed + push user_input event.
    const onTermData = term.onData((data) => {
      void ipc().agent.input({ sessionId, text: data });
      if (data === "\r" || data === "\n") {
        const submitted = lineBufferRef.current.trim();
        lineBufferRef.current = "";
        if (submitted.length > 0) {
          useAgent.getState().pushUserEvent(sessionId, submitted);
          useFeed.getState().setState("expanded");
          useFeed.getState().refresh(sessionId);
        }
      } else if (data === "\u007f" || data === "\b") {
        lineBufferRef.current = lineBufferRef.current.slice(0, -1);
      } else if (data.length === 1 && data >= " ") {
        lineBufferRef.current += data;
      }
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); reportResize(); } catch { /* ignore */ }
    });
    ro.observe(containerRef.current);

    if (active) {
      setTimeout(() => term.focus(), 80);
    }

    return () => {
      offOutput();
      onTermData.dispose();
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, [sessionId]); // only re-mount if session id changes (shouldn't happen)

  // Refit + focus when this session becomes active
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => {
      try {
        fitRef.current?.fit();
        xtermRef.current?.focus();
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(id);
  }, [active]);

  return (
    <div
      ref={containerRef}
      onClick={() => xtermRef.current?.focus()}
      style={{ display: active ? "block" : "none" }}
      className="h-full w-full px-10 pt-8 pb-6 overflow-hidden cursor-text"
    />
  );
}
