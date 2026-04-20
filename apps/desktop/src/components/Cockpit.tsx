import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useAgent } from "@/store/agent";
import { useSettings } from "@/store/settings";
import { useFeed } from "@/store/feed";
import { ipc } from "@/lib/ipc";
import { IdexLogo } from "./IdexLogo";
import { PromptInput } from "./PromptInput";
import { FeedPane } from "./FeedPane";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "./Button";

export function Cockpit() {
  const config = useSettings((s) => s.config);
  const agentState = useAgent((s) => s.state);
  const lastError = useAgent((s) => s.lastError);
  const feedState = useFeed((s) => s.state);

  const xtermContainer = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Wire xterm to agent stream
  useEffect(() => {
    if (!xtermContainer.current) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.4,
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
      },
      scrollback: 4000,
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(xtermContainer.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(xtermContainer.current);

    // Spawn the agent — empty cwd lets main process default to os.homedir()
    void useAgent.getState().spawn(config.selectedAgent, "");

    // Wire output stream into xterm + send user keystrokes back
    const offOutput = ipc().agent.onOutput((chunk) => {
      term.write(chunk.raw);
    });
    const onTermData = term.onData((data) => {
      // Send keystrokes (raw) to agent — except Enter, which is also handled by PromptInput
      void window.idex.agent.input({ text: data });
    });

    return () => {
      offOutput();
      onTermData.dispose();
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, [config.selectedAgent]);

  const cwdLabel = "~";

  return (
    <div className="flex h-full w-full bg-ink-0">
      {/* Cockpit (main) */}
      <main
        className="relative flex h-full flex-1 flex-col bg-ink-1 border-r border-line transition-[width,opacity] duration-[280ms]"
        style={{
          opacity: feedState === "expanded" ? 0.45 : 1,
        }}
      >
        <header className="glass draggable flex items-center justify-between border-b border-line px-6 py-3 h-14">
          <div className="flex items-center gap-4 no-drag">
            <IdexLogo />
            <div className="text-[12px] font-mono text-text-secondary">
              <span className="text-text-primary font-medium">
                {agentLabel(config.selectedAgent)}
              </span>{" "}
              · {cwdLabel}
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-accent-soft text-accent">
                v0.1
              </span>
            </div>
          </div>
          <div className="no-drag flex items-center gap-2">
            <StatusPill state={agentState} />
          </div>
        </header>

        {lastError && (
          <div className="border-b border-error/20 bg-error/10 px-6 py-2.5 text-[12px] text-error flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="size-3.5" />
              {lastError}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void useAgent.getState().spawn(config.selectedAgent, "")}
            >
              <RefreshCcw className="size-3" /> Retry
            </Button>
          </div>
        )}

        <div ref={xtermContainer} className="flex-1 px-6 py-4 overflow-hidden" />

        <PromptInput />
      </main>

      {/* Feed pane */}
      <FeedPane />
    </div>
  );
}

function agentLabel(id: string) {
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
