import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import { useFeed } from "@/store/feed";
// also imported by xterm handler below
import { ipc } from "@/lib/ipc";
import { IdexLogo } from "./IdexLogo";
import { FeedPane } from "./FeedPane";
import { AlertCircle, RefreshCcw, Settings as SettingsIcon, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "./Button";
import type { AgentId } from "@idex/types";

export function Cockpit() {
  const config = useSettings((s) => s.config);
  const patchConfig = useSettings((s) => s.patch);
  const agentState = useAgent((s) => s.state);
  const lastError = useAgent((s) => s.lastError);
  const feedState = useFeed((s) => s.state);
  const setFeedState = useFeed((s) => s.setState);

  const xtermContainer = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [spawned, setSpawned] = useState(false);

  useEffect(() => {
    if (!xtermContainer.current) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.45,
      letterSpacing: 0,
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
    term.open(xtermContainer.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    // A very short splash — Claude Code prints its own banner within ~200ms
    term.writeln("\x1b[38;2;61;123;255m  ▸\x1b[0m \x1b[38;2;139;146;165mstarting " + agentLabel(config.selectedAgent) + "...\x1b[0m");
    term.writeln("");

    // Spawn agent
    void useAgent.getState().spawn(config.selectedAgent, "").then((r) => {
      if (r.ok) setSpawned(true);
    });

    // Agent stdout → xterm
    const offOutput = ipc().agent.onOutput((chunk) => {
      term.write(chunk.raw);
    });

    // xterm keystrokes → agent PTY (raw, no CR appending)
    // Track typed text so we can infer "user submitted a message" when Enter
    // is pressed inside the TUI — that's our trigger to expand the feed.
    let lineBuffer = "";
    const onTermData = term.onData((data) => {
      void window.idex.agent.input({ text: data });
      // Detect Enter (\r or \n) as submission
      if (data === "\r" || data === "\n") {
        const submitted = lineBuffer.trim();
        lineBuffer = "";
        if (submitted.length > 0) {
          // Record the user event and trigger feed expansion/refresh
          useAgent.getState().pushUserEvent(submitted);
          useFeed.getState().setState("expanded");
          useFeed.getState().refresh();
        }
      } else if (data === "\u007f" || data === "\b") {
        // Backspace
        lineBuffer = lineBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= " ") {
        lineBuffer += data;
      }
      // Ignore Ctrl codes / arrows — they aren't user text
    });

    // Auto-refit on resize
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    ro.observe(xtermContainer.current);

    // Focus terminal after mount
    const focusTimer = setTimeout(() => term.focus(), 150);

    return () => {
      clearTimeout(focusTimer);
      offOutput();
      onTermData.dispose();
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
      setSpawned(false);
    };
  }, [config.selectedAgent]);

  const focusTerminal = () => xtermRef.current?.focus();
  const toggleFeed = () => setFeedState(feedState === "peek" ? "expanded" : "peek");

  return (
    <div className="flex h-full w-full bg-ink-0">
      <main className="relative flex h-full flex-1 flex-col bg-ink-1 border-r border-line">
        <header className="glass draggable flex items-center justify-between border-b border-line pl-24 pr-4 py-3 h-14 shrink-0">
          <div className="flex items-center gap-4 no-drag min-w-0">
            <IdexLogo />
            <div className="text-[12px] font-mono text-text-secondary flex items-center gap-2 min-w-0">
              <AgentPicker
                value={config.selectedAgent}
                onChange={(id) => void patchConfig({ selectedAgent: id })}
              />
              <span className="opacity-40">·</span>
              <span className="opacity-70 truncate">{config.agentBinaryPath || "~"}</span>
              <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-accent-soft text-accent shrink-0">
                v0.1.0
              </span>
            </div>
          </div>
          <div className="no-drag flex items-center gap-2">
            <StatusPill state={agentState} />
            <button
              onClick={toggleFeed}
              title={feedState === "peek" ? "Expand feed" : "Collapse feed"}
              className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              {feedState === "peek" ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            </button>
            <button
              onClick={() => void patchConfig({ privacyDisclosureAccepted: false })}
              title="Settings"
              className="press-feedback p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2 transition-colors"
            >
              <SettingsIcon className="size-4" />
            </button>
          </div>
        </header>

        {lastError && <SpawnErrorBanner error={lastError} agentId={config.selectedAgent} />}

        <div
          onClick={focusTerminal}
          ref={xtermContainer}
          className="flex-1 px-8 pt-6 pb-4 overflow-hidden cursor-text"
        />

        <footer className="border-t border-line bg-ink-1 px-6 py-2.5 flex items-center justify-between text-[11px] font-mono text-text-secondary shrink-0">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">⌃C</kbd> interrupt
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">⌃D</kbd> exit
            </span>
            {!spawned && !lastError && (
              <span className="text-accent animate-pulse">spawning {agentLabel(config.selectedAgent)}…</span>
            )}
            {spawned && agentState === "idle" && (
              <span>type into the terminal to chat with {agentLabel(config.selectedAgent)}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>feed {config.feedEnabled ? "on" : "off"}</span>
            <button
              onClick={() => void patchConfig({ feedEnabled: !config.feedEnabled })}
              className="press-feedback text-accent hover:brightness-125 underline-offset-2 hover:underline"
            >
              toggle
            </button>
          </div>
        </footer>
      </main>

      <FeedPane />
    </div>
  );
}

function AgentPicker({ value, onChange }: { value: AgentId; onChange: (id: AgentId) => void }) {
  const [open, setOpen] = useState(false);
  const agents: Array<{ id: AgentId; label: string; enabled: boolean; install: string }> = [
    { id: "claude-code", label: "Claude Code", enabled: true, install: "npm i -g @anthropic-ai/claude-code" },
    { id: "codex", label: "Codex", enabled: false, install: "npm i -g @openai/codex" },
    { id: "freebuff", label: "Freebuff", enabled: false, install: "npm i -g freebuff" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="press-feedback text-text-primary font-medium hover:text-accent transition-colors"
      >
        {agentLabel(value)} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-30 w-72 rounded-lg border border-line bg-ink-1 shadow-2xl overflow-hidden">
            {agents.map((a) => (
              <button
                key={a.id}
                disabled={!a.enabled}
                onClick={() => {
                  if (!a.enabled) return;
                  onChange(a.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2 transition-colors ${
                  a.enabled ? "hover:bg-ink-2" : "opacity-40 cursor-not-allowed"
                } ${value === a.id ? "bg-accent-soft" : ""}`}
              >
                <div className="flex-1">
                  <div className="text-[13px] font-display font-semibold text-text-primary">
                    {a.label}
                    {!a.enabled && <span className="ml-2 text-[10px] uppercase text-text-secondary">soon</span>}
                  </div>
                  <div className="text-[11px] font-mono text-text-secondary mt-0.5">
                    {a.install}
                  </div>
                </div>
                {value === a.id && <span className="text-accent text-[11px] mt-0.5">●</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SpawnErrorBanner({ error, agentId }: { error: string; agentId: AgentId }) {
  const installMap: Record<AgentId, string> = {
    "claude-code": "npm install -g @anthropic-ai/claude-code",
    codex: "npm install -g @openai/codex",
    freebuff: "npm install -g freebuff",
  };
  const install = installMap[agentId];
  const copyInstall = () => void navigator.clipboard.writeText(install);
  return (
    <div className="border-b border-error/20 bg-error/10 px-6 py-3 text-[12px] text-text-primary flex items-start justify-between gap-4">
      <div className="flex gap-2.5">
        <AlertCircle className="size-4 text-error shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-error">Couldn't start {agentLabel(agentId)}</div>
          <div className="mt-0.5 text-text-secondary leading-relaxed">{error}</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="text-[11px] font-mono bg-ink-0 px-2 py-1 rounded border border-line text-text-primary">
              {install}
            </code>
            <button
              onClick={copyInstall}
              className="press-feedback text-[11px] text-accent hover:brightness-125 underline-offset-2 hover:underline"
            >
              copy
            </button>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void useAgent.getState().spawn(agentId, "")}
      >
        <RefreshCcw className="size-3" /> Retry
      </Button>
    </div>
  );
}

function agentLabel(id: AgentId | string) {
  switch (id) {
    case "claude-code": return "Claude Code";
    case "codex": return "Codex";
    case "freebuff": return "Freebuff";
    default: return id;
  }
}

function StatusPill({ state }: { state: string }) {
  const map: Record<string, { label: string; klass: string }> = {
    idle: { label: "ready", klass: "bg-ink-2 text-text-secondary" },
    spawning: { label: "spawning…", klass: "bg-accent-soft text-accent" },
    generating: { label: "generating…", klass: "bg-accent-soft text-accent peek-pulse" },
    done: { label: "done", klass: "bg-ink-2 text-text-secondary" },
    error: { label: "error", klass: "bg-error/15 text-error" },
  };
  const meta = map[state] ?? map["idle"];
  return (
    <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full ${meta!.klass}`}>
      {meta!.label}
    </span>
  );
}
