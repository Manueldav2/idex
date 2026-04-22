import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X as CloseIcon,
  Key,
  Twitter,
  Sparkles,
  Bot,
  Timer,
  Shield,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react";
import { KEYCHAIN_KEY, type AgentId, type ComposioStatusResult } from "@idex/types";
import { useSettings } from "@/store/settings";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/cn";

/**
 * The Settings drawer is the single place users configure agent choice,
 * API keys, curator behaviour, and privacy. It slides in from the right
 * and persists each change immediately via `useSettings.patch`.
 *
 * Keys are written to the OS keychain — never to disk. `loaded` flags
 * track whether the drawer has pulled the currently-stored value from
 * the main process (keychain reads are async).
 */
export function Settings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const config = useSettings((s) => s.config);
  const patch = useSettings((s) => s.patch);

  // Keys are held in component state. We show "••••" as the placeholder
  // when a key is stored so the user knows one exists without revealing it.
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [openrouterStored, setOpenrouterStored] = useState(false);
  const [composioKey, setComposioKey] = useState("");
  const [composioStored, setComposioStored] = useState(false);
  const [composioAuthConfig, setComposioAuthConfig] = useState("");
  const [composioAuthConfigStored, setComposioAuthConfigStored] = useState(false);
  const [status, setStatus] = useState<ComposioStatusResult | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // On drawer open, pull stored keychain values so we can render "stored"
  // markers. We never read the key value itself into component state — we
  // just need to know whether each slot is populated.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [or, cx, ac, st] = await Promise.all([
        ipc().keychain.get(KEYCHAIN_KEY.OPENROUTER_API_KEY),
        ipc().keychain.get(KEYCHAIN_KEY.COMPOSIO_API_KEY),
        ipc().keychain.get(KEYCHAIN_KEY.COMPOSIO_AUTH_CONFIG_ID),
        ipc().composio.status(),
      ]);
      if (cancelled) return;
      setOpenrouterStored(Boolean(or));
      setComposioStored(Boolean(cx));
      setComposioAuthConfigStored(Boolean(ac));
      setStatus(st);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const saveOpenrouterKey = async () => {
    const v = openrouterKey.trim();
    if (!v) return;
    await ipc().keychain.set(KEYCHAIN_KEY.OPENROUTER_API_KEY, v);
    setOpenrouterKey("");
    setOpenrouterStored(true);
  };

  const saveComposioKey = async () => {
    const v = composioKey.trim();
    if (!v) return;
    await ipc().keychain.set(KEYCHAIN_KEY.COMPOSIO_API_KEY, v);
    setComposioKey("");
    setComposioStored(true);
  };

  const saveComposioAuthConfig = async () => {
    const v = composioAuthConfig.trim();
    if (!v) return;
    await ipc().keychain.set(KEYCHAIN_KEY.COMPOSIO_AUTH_CONFIG_ID, v);
    setComposioAuthConfig("");
    setComposioAuthConfigStored(true);
  };

  const connectX = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await ipc().composio.connectX();
      if (!res.ok) {
        setConnectError(res.error ?? "connect failed");
      } else {
        const st = await ipc().composio.status();
        setStatus(st);
      }
    } finally {
      setConnecting(false);
    }
  };

  const refreshStatus = async () => {
    const st = await ipc().composio.status();
    setStatus(st);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[460px] max-w-full bg-ink-1 border-l border-line shadow-2xl overflow-y-auto"
            role="dialog"
            aria-label="Settings"
          >
            <header className="sticky top-0 flex items-center justify-between px-6 py-4 bg-ink-1/95 backdrop-blur border-b border-line z-10">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-semibold text-lg text-text-primary">
                  Settings
                </h2>
              </div>
              <button
                className="press-feedback p-1.5 rounded-md text-text-secondary hover:bg-ink-2 hover:text-text-primary"
                onClick={onClose}
                aria-label="Close settings"
              >
                <CloseIcon className="size-4" />
              </button>
            </header>

            <div className="px-6 py-5 space-y-8">
              <Section icon={Bot} title="Agent">
                <label className="block text-[13px] text-text-secondary mb-2">
                  Primary coding agent
                </label>
                <AgentPicker
                  value={config.selectedAgent}
                  onChange={(id) => void patch({ selectedAgent: id })}
                />
              </Section>

              <Section icon={Sparkles} title="Curator">
                <Toggle
                  label="Enable curator feed"
                  description="Generates a contextual feed while the agent is thinking."
                  checked={config.curatorEnabled}
                  onChange={(v) => void patch({ curatorEnabled: v })}
                />
                <Toggle
                  label="Sponsored cards (trygravity.ai)"
                  description="Disabled by default. Only affects opt-in inventory."
                  checked={config.adsEnabled}
                  onChange={(v) => void patch({ adsEnabled: v })}
                />
                <Toggle
                  label="Anonymous quality telemetry"
                  description="Shares topic hashes + thumbs — never prompts or code."
                  checked={config.curatorTelemetryEnabled}
                  onChange={(v) => void patch({ curatorTelemetryEnabled: v })}
                />

                <div className="mt-3">
                  <label className="block text-[13px] text-text-secondary mb-1.5">
                    <Timer className="inline size-3 mr-1 -mt-0.5" />
                    Autoscroll speed
                  </label>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    step={1}
                    value={config.autoscrollSeconds}
                    onChange={(e) =>
                      void patch({ autoscrollSeconds: Number(e.target.value) })
                    }
                    className="w-full accent-accent"
                  />
                  <div className="text-[11px] font-mono text-text-secondary mt-1">
                    {config.autoscrollSeconds}s per card
                  </div>
                </div>
              </Section>

              <Section icon={Key} title="OpenRouter (for GLM-4.6 planning)">
                <KeyField
                  stored={openrouterStored}
                  placeholder="sk-or-..."
                  value={openrouterKey}
                  onChange={setOpenrouterKey}
                  onSave={saveOpenrouterKey}
                  helpUrl="https://openrouter.ai/keys"
                  helpLabel="Get an OpenRouter API key"
                />
              </Section>

              <Section icon={Twitter} title="X via Composio">
                <KeyField
                  stored={composioStored}
                  placeholder="cm_..."
                  value={composioKey}
                  onChange={setComposioKey}
                  onSave={saveComposioKey}
                  helpUrl="https://app.composio.dev/api_keys"
                  helpLabel="Get a Composio API key"
                  label="Composio API key"
                />
                <KeyField
                  stored={composioAuthConfigStored}
                  placeholder="auth_config_..."
                  value={composioAuthConfig}
                  onChange={setComposioAuthConfig}
                  onSave={saveComposioAuthConfig}
                  helpUrl="https://app.composio.dev/integrations/twitter"
                  helpLabel="Create an X integration (auth config)"
                  label="Composio auth-config id"
                />

                <div className="mt-3 p-3 rounded-lg border border-line bg-ink-0/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px]">
                      <StatusDot status={status?.status ?? "UNKNOWN"} />
                      <span className="text-text-primary font-medium">
                        {connectedLabel(status)}
                      </span>
                    </div>
                    <button
                      onClick={refreshStatus}
                      className="press-feedback p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-ink-2"
                      title="Refresh status"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </div>
                  <button
                    disabled={connecting || !composioStored || !composioAuthConfigStored}
                    onClick={() => void connectX()}
                    className={cn(
                      "mt-3 w-full press-feedback text-[13px] font-medium rounded-md py-2 px-3 border",
                      connecting
                        ? "bg-ink-2 border-line text-text-secondary cursor-not-allowed"
                        : "bg-accent-soft border-accent/40 text-accent hover:bg-accent/15",
                      (!composioStored || !composioAuthConfigStored) &&
                        "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {connecting ? "Opening browser…" : "Connect X"}
                  </button>
                  {connectError && (
                    <div className="mt-2 text-[12px] text-error flex items-start gap-1.5">
                      <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span>{connectError}</span>
                    </div>
                  )}
                </div>
              </Section>

              <Section icon={Shield} title="Privacy">
                <Toggle
                  label="Privacy panic mode"
                  description="Instantly disables curator + clears the feed. Agent still works."
                  checked={!config.curatorEnabled && config.privacyDisclosureAccepted}
                  onChange={(v) => void patch({ curatorEnabled: !v })}
                />
                <p className="text-[12px] text-text-secondary leading-relaxed mt-3">
                  Secrets are stored in the OS keychain. Curator queries may be sent
                  to third parties when enabled. See{" "}
                  <button
                    className="text-accent underline-offset-2 hover:underline"
                    onClick={() =>
                      void window.idex.openExternal(
                        "https://github.com/Manueldav2/idex#privacy",
                      )
                    }
                  >
                    privacy policy
                  </button>
                  .
                </p>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────── UI primitives ──────────────────────────── */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Key;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-display font-semibold text-[13px] uppercase tracking-wider text-text-secondary mb-3">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={cn(
          "relative mt-0.5 shrink-0 inline-block w-9 h-5 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-ink-2 border border-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text-primary">{label}</div>
        {description && (
          <div className="text-[12px] text-text-secondary mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}

function KeyField({
  stored,
  placeholder,
  value,
  onChange,
  onSave,
  helpUrl,
  helpLabel,
  label,
}: {
  stored: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  helpUrl: string;
  helpLabel: string;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      {label && (
        <label className="block text-[13px] text-text-secondary mb-1.5">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={stored ? "•••••••••••••••• (stored)" : placeholder}
            className="w-full rounded-md bg-ink-0 border border-line px-3 py-2 text-[13px] font-mono text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent/60"
          />
          {value && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-wider text-text-secondary hover:text-text-primary"
            >
              {show ? "hide" : "show"}
            </button>
          )}
        </div>
        <button
          onClick={onSave}
          disabled={!value.trim()}
          className={cn(
            "press-feedback text-[12px] font-medium rounded-md py-2 px-3 border",
            value.trim()
              ? "bg-accent-soft border-accent/40 text-accent hover:bg-accent/15"
              : "bg-ink-2 border-line text-text-secondary cursor-not-allowed",
          )}
        >
          {stored ? "Replace" : "Save"}
        </button>
      </div>
      <button
        className="mt-1.5 text-[11px] text-accent/80 hover:text-accent inline-flex items-center gap-1"
        onClick={() => void window.idex.openExternal(helpUrl)}
      >
        <MessageSquare className="size-3" />
        {helpLabel}
      </button>
    </div>
  );
}

function AgentPicker({
  value,
  onChange,
}: {
  value: AgentId;
  onChange: (id: AgentId) => void;
}) {
  const agents: Array<{ id: AgentId; label: string; tagline: string }> = [
    { id: "claude-code", label: "Claude Code", tagline: "Anthropic's CLI" },
    { id: "codex", label: "Codex", tagline: "OpenAI's CLI" },
    { id: "freebuff", label: "Freebuff", tagline: "Codebuff's CLI" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {agents.map((a) => {
        const active = a.id === value;
        return (
          <button
            key={a.id}
            onClick={() => onChange(a.id)}
            className={cn(
              "press-feedback text-left rounded-lg border p-2.5 transition-colors",
              active
                ? "border-accent bg-accent-soft"
                : "border-line bg-ink-0 hover:bg-ink-2",
            )}
          >
            <div className="text-[12px] font-semibold text-text-primary">
              {a.label}
            </div>
            <div className="text-[11px] text-text-secondary mt-0.5 leading-tight">
              {a.tagline}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return <CheckCircle2 className="size-3.5 text-[#00ba7c]" />;
  if (s === "INITIATED")
    return <Circle className="size-3.5 text-yellow-400 animate-pulse" />;
  if (s === "FAILED" || s === "EXPIRED")
    return <AlertCircle className="size-3.5 text-error" />;
  return <Circle className="size-3.5 text-text-secondary" />;
}

function connectedLabel(status: ComposioStatusResult | null): string {
  if (!status) return "No X account connected";
  if (!status.connectedAccountId) return "No X account connected";
  switch (status.status) {
    case "ACTIVE":
      return "X connected";
    case "INITIATED":
      return "Awaiting consent…";
    case "FAILED":
      return "Connection failed";
    case "EXPIRED":
      return "Connection expired";
    default:
      return "Status unknown";
  }
}
