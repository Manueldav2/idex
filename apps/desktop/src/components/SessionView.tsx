import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import type { SessionData } from "@/store/agent";
import { useAgent } from "@/store/agent";
import { useFeed } from "@/store/feed";
import { useSettings } from "@/store/settings";
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
  // Subscribe to feed state so we can refit the xterm when the feed
  // collapses — coming back from a full-screen feed leaves the cockpit
  // freshly sized and xterm needs to re-measure or the output wraps at
  // the old width.
  const feedState = useFeed((s) => s.state);
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

    /*
     * Verbatim VS Code terminal config — pulled from
     * microsoft/vscode/src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts
     * and microsoft/vscode/src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts.
     * Cursor inherits this. Claude Code renders perfectly under it
     * because every value here is what xterm.js's authors actually
     * test against — and lineHeight: 1 makes cell math trivially
     * exact (no fractional rounding artifacts).
     */
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
      scrollback: 10000,
      smoothScrollDuration: 0,
      // customGlyphs lives on Terminal options in @xterm/addon-webgl v0.18
      // (newer versions moved it to the addon constructor — VS Code is on
      // the newer one). Effect is the same: box-drawing/Powerline/git
      // glyphs are rasterised by xterm itself, cell-aligned.
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

    // WebGL renderer — fast, accurate glyph rendering with proper sub-
    // pixel positioning. Falls back to canvas silently if WebGL isn't
    // available in this webview context.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("[idex] WebGL renderer unavailable, using canvas", e);
    }

    xtermRef.current = term;
    fitRef.current = fit;

    // Resize PTY to match xterm dims
    const reportResize = () => {
      try {
        const { cols, rows } = term;
        void ipc().agent.resize({ sessionId, cols, rows });
      } catch { /* ignore */ }
    };

    /*
     * Robust fit. The naive approach — call fit.fit() once at mount —
     * lands wrong dimensions in three real situations:
     *   1. Container has 0 width because layout hasn't finalized yet
     *      (React mounts inside an absolute-inset parent that's still
     *      computing).
     *   2. The measured font isn't loaded so cellWidth uses a fallback
     *      font that's much wider than the eventual SF Mono / Menlo →
     *      cols comes out tiny.
     *   3. WKWebView (Tauri) sometimes reports clientWidth before the
     *      WebGL canvas attaches, returning the pre-attach inset.
     *
     * Anything below 30 cols is almost certainly garbage for an IDE
     * terminal — Claude Code renders its welcome banner at whatever
     * cols PTY reports at start, so a bad initial fit leaves the
     * banner stuck wrapped at 10 chars even after we resize. This loop
     * retries (up to ~1.5s) until cols climbs above the sanity floor.
     */
    const safeFit = () => {
      try {
        fit.fit();
        const { cols, rows } = term;
        return { cols, rows };
      } catch {
        return { cols: 0, rows: 0 };
      }
    };
    const SANE_COLS_FLOOR = 30;
    let fitAttempts = 0;
    const tryFit = () => {
      fitAttempts += 1;
      const { cols, rows } = safeFit();
      if (cols >= SANE_COLS_FLOOR) {
        // Sane dims — push to PTY and refresh.
        reportResize();
        term.refresh(0, rows - 1);
        return;
      }
      if (fitAttempts < 20) {
        // Don't push the bogus narrow size to the PTY — that's what was
        // freezing Claude's welcome banner at 10 cols. Retry instead.
        window.setTimeout(tryFit, 75);
      } else {
        // Last-ditch: refresh whatever we have but still don't shrink
        // the PTY. Better an unrendered terminal than a permanently
        // narrow one.
        term.refresh(0, term.rows - 1);
      }
    };

    // Kick off fitting after the next paint so layout is settled. Then
    // also refit once fonts have finished loading so cellWidth is
    // measured against the final font.
    requestAnimationFrame(() => tryFit());
    const onFontsReady = async () => {
      try {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch { /* ignore */ }
      requestAnimationFrame(() => {
        const { cols, rows } = safeFit();
        if (cols >= SANE_COLS_FLOOR) {
          term.refresh(0, rows - 1);
          reportResize();
        }
      });
    };
    void onFontsReady();

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
      // Core product loop: type prompt → feed expands and curates →
      // scroll while Claude works → feed collapses back when Claude's
      // done (handled by feed.bindToAgent's dwell-guarded collapse).
      // The user wanted this back after I'd briefly removed it; the
      // feed-pull is the whole point of IDEX.
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
      // Same sanity gate as the initial fit: never tell the PTY to
      // shrink to a bogus narrow size. The fit will be re-attempted
      // when the next resize event fires with a real container width.
      try {
        fit.fit();
        if (term.cols >= SANE_COLS_FLOOR) {
          reportResize();
        }
      } catch { /* ignore */ }
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
        const t = xtermRef.current;
        if (t) {
          // Re-draw the whole viewport. WebGL/canvas state retained
          // stale pixels from the previously-visible tab — without a
          // full refresh, switching tabs left ghosted input lines from
          // the outgoing session painted on top of the incoming one.
          t.refresh(0, t.rows - 1);
          t.focus();
          // Also report new dims to the PTY so Claude rewraps.
          try {
            void ipc().agent.resize({ sessionId, cols: t.cols, rows: t.rows });
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(id);
  }, [active]);

  // Refit + force a full canvas redraw whenever the cockpit mode changes
  // back to "agent". Without this, xterm keeps whatever dimensions it had
  // when it went display:none (editor/autopilot modes) and Claude Code's
  // ASCII box characters render mis-aligned — the canvas was cached
  // while the container had a stale size. refresh(0, rows-1) rewrites
  // every cell from the buffer so box drawing lands back on the cell
  // grid.
  const cockpitMode = useSettings((s) => s.config.mode);
  useEffect(() => {
    if (cockpitMode !== "agent") return;
    if (!active) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    // Two-phase refit: wait a tick for the display:block transition to
    // settle (so clientWidth/Height are real), then fit + refresh.
    const id = window.setTimeout(() => {
      try {
        fit.fit();
        term.refresh(0, term.rows - 1);
        const { cols, rows } = term;
        void ipc().agent.resize({ sessionId, cols, rows });
      } catch { /* ignore */ }
    }, 60);
    return () => window.clearTimeout(id);
  }, [cockpitMode, active, sessionId]);

  return (
    <div
      ref={containerRef}
      onClick={() => xtermRef.current?.focus()}
      style={{ display: active ? "block" : "none" }}
      className="h-full w-full px-5 pt-3 pb-3 overflow-hidden cursor-text"
    />
  );
}
