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
  // First-run trust-prompt auto-accept: we scan the cleaned output buffer
  // for "trust this folder" and send Enter once, but only if the user hasn't
  // typed yet. Refs keep this scoped per-session with no re-render churn.
  const cleanTextBufferRef = useRef("");
  const userHasTypedRef = useRef(false);
  const autoAcceptedRef = useRef(false);
  // Active-state ref so the stable xterm.onData callback (set once in the
  // [sessionId] effect below) can early-return when this session is in the
  // background tab — otherwise stray keystrokes / shell output can push
  // bogus user_input events for an inactive session.
  const activeRef = useRef(active);
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

      // Accumulate cleaned stdout to detect Claude Code's trust-folder prompt.
      // Cap the buffer so we don't grow unbounded over a long session.
      if (!autoAcceptedRef.current) {
        cleanTextBufferRef.current += chunk.clean;
        if (cleanTextBufferRef.current.length > 16000) {
          cleanTextBufferRef.current = cleanTextBufferRef.current.slice(-8000);
        }
        const match = /trust this folder/i.test(cleanTextBufferRef.current);
        if (match && !userHasTypedRef.current) {
          autoAcceptedRef.current = true;
          setTimeout(() => {
            // Recheck right before sending — user may have started typing
            // during the 400ms delay.
            if (userHasTypedRef.current) return;
            void ipc().agent.input({ sessionId, text: "\r" });
          }, 400);
        }
      }
    });

    // Send xterm keystrokes → PTY (raw). Detect Enter-with-typed-content
    // as a user submission → expand feed + push user_input event.
    //
    // `data` can be a single keystroke OR a pasted blob containing many
    // characters and embedded newlines. We iterate character-by-character
    // so pastes don't slip past the line buffer.
    const commitSubmission = () => {
      const submitted = lineBufferRef.current.trim();
      lineBufferRef.current = "";
      if (submitted.length === 0) return;
      // Push the user event + force the feed to expand + kick off a fresh
      // curate pass. This is the core product flow: user sends a prompt,
      // feed arrives. Don't let anything silently swallow it.
      try {
        useAgent.getState().pushUserEvent(sessionId, submitted);
        useFeed.getState().setState("expanded");
        useFeed.getState().refresh(sessionId);
      } catch (e) {
        console.error("[idex] feed expand failed", e);
      }
    };

    const onTermData = term.onData((data) => {
      if (!activeRef.current) return;
      // Any keystroke from the user cancels the pending auto-accept and
      // marks the session as "user has interacted" forever.
      userHasTypedRef.current = true;
      // Always forward raw bytes to the PTY first — this is what Claude
      // Code actually reads.
      void ipc().agent.input({ sessionId, text: data });

      // Now update our local line buffer, one character at a time, so
      // we handle both single keystrokes AND pasted blobs uniformly.
      // An ANSI escape sequence starts with ESC (\x1b); we don't try to
      // parse it as text but we also don't want its bytes poisoning the
      // buffer — arrow keys shouldn't show up as typed characters.
      let inEscape = false;
      for (let i = 0; i < data.length; i++) {
        const ch = data[i]!;
        if (inEscape) {
          // Very loose: skip until the next letter (CSI sequences end in
          // an alphabetic final byte). Good enough to not pollute the
          // line buffer with random bytes.
          if (/[a-zA-Z~]/.test(ch)) inEscape = false;
          continue;
        }
        if (ch === "\x1b") {
          inEscape = true;
          continue;
        }
        if (ch === "\r" || ch === "\n") {
          commitSubmission();
          continue;
        }
        if (ch === "\u007f" || ch === "\b") {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          continue;
        }
        // Accept any printable character (including tabs and unicode).
        if (ch >= " " || ch === "\t") {
          lineBufferRef.current += ch;
        }
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

  // Keep activeRef in sync for the onData closure. Also clear the line
  // buffer on tab-switch so stale characters don't get coalesced into the
  // next Enter submission.
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      lineBufferRef.current = "";
      return;
    }
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
