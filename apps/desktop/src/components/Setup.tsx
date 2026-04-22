import { useState, useEffect } from "react";
import { Button } from "./Button";
import { IdexLogo } from "./IdexLogo";
import { useSettings } from "@/store/settings";
import { Shield, Sparkles, ChevronRight, ExternalLink } from "lucide-react";

type Step = "welcome" | "agent" | "privacy" | "done";

export function Setup() {
  const { config, patch } = useSettings();
  const [step, setStep] = useState<Step>("welcome");

  // Keyboard shortcuts — Enter advances the primary action on each step.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Skip if the user is focused in an input/textarea
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (step === "welcome") {
        setStep("agent");
      } else if (step === "agent") {
        await patch({ selectedAgent: config.selectedAgent });
        setStep("privacy");
      } else if (step === "privacy") {
        await patch({ privacyDisclosureAccepted: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, config.selectedAgent, patch]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-0 p-12 draggable">
      <div className="w-full max-w-2xl no-drag">
        <div className="mb-12 flex items-center justify-between">
          <IdexLogo />
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-text-secondary font-mono">
              <kbd className="px-1.5 py-0.5 rounded border border-line">↵</kbd> continue
            </span>
            <span className="text-xs text-text-secondary font-mono">
              {step === "welcome" && "1 of 3"}
              {step === "agent" && "2 of 3"}
              {step === "privacy" && "3 of 3"}
            </span>
          </div>
        </div>

        {step === "welcome" && <WelcomePane onNext={() => setStep("agent")} />}
        {step === "agent" && (
          <AgentPickPane
            current={config.selectedAgent}
            onPick={async (id) => {
              await patch({ selectedAgent: id });
              setStep("privacy");
            }}
          />
        )}
        {step === "privacy" && (
          <PrivacyPane
            onAccept={async () => {
              await patch({ privacyDisclosureAccepted: true });
            }}
          />
        )}
      </div>
    </div>
  );
}

function WelcomePane({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display font-bold tracking-tight text-text-primary text-5xl leading-[1.05]">
          Code while you scroll.
        </h1>
        <p className="mt-4 text-text-secondary text-base leading-relaxed max-w-lg">
          IDEX is the IDE that watches the wait. Pick your agent, connect your sources,
          and we&apos;ll keep you company while it generates.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={onNext}>
          Let&apos;s go <ChevronRight className="size-4" />
        </Button>
        <span className="text-xs text-text-secondary">
          Free. Open source. Bring your own API keys.
        </span>
      </div>
    </div>
  );
}

import type { AgentId } from "@idex/types";

function AgentPickPane({
  current,
  onPick,
}: {
  current: AgentId;
  onPick: (id: AgentId) => void;
}) {
  const [selected, setSelected] = useState<AgentId>(current);
  const agents: Array<{
    id: AgentId;
    name: string;
    tagline: string;
    install: string;
    badge?: string;
  }> = [
    {
      id: "claude-code",
      name: "Claude Code",
      tagline: "Anthropic's official terminal coding agent. The gold standard.",
      install: "npm install -g @anthropic-ai/claude-code",
    },
    {
      id: "codex",
      name: "Codex",
      tagline: "OpenAI's open-source coding agent. Multi-step planning.",
      install: "npm install -g @openai/codex",
      badge: "Soon",
    },
    {
      id: "freebuff",
      name: "Freebuff",
      tagline: "The free, ad-supported coding agent from Codebuff.",
      install: "npm install -g freebuff",
      badge: "Soon",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-semibold text-2xl text-text-primary">
          Pick your agent.
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          You can change this anytime in Settings.
        </p>
      </div>
      <div className="space-y-2.5">
        {agents.map((a) => {
          const active = selected === a.id;
          const disabled = a.id !== "claude-code";
          return (
            <button
              key={a.id}
              onClick={() => !disabled && setSelected(a.id)}
              disabled={disabled}
              className={`press-feedback w-full text-left rounded-xl border p-4 transition-colors ${
                active && !disabled
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-ink-1 hover:bg-ink-2"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold text-text-primary text-base">
                  {a.name}
                </div>
                {a.badge && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary px-2 py-0.5 rounded border border-line">
                    {a.badge}
                  </span>
                )}
                {!a.badge && active && (
                  <span className="text-[11px] font-mono uppercase tracking-wider text-accent">
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-text-secondary">{a.tagline}</p>
              <code className="mt-2 inline-block text-[11px] font-mono text-text-secondary bg-ink-0 px-2 py-1 rounded border border-line">
                {a.install}
              </code>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end">
        <Button onClick={() => onPick(selected)}>
          Continue <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function PrivacyPane({ onAccept }: { onAccept: () => void }) {
  const openExternal = (url: string) => () => {
    void window.idex.openExternal(url);
  };
  const { config, patch } = useSettings();
  const [token, setToken] = useState(config.xBearerToken ?? "");
  const [orKey, setOrKey] = useState("");
  // Hydrate OpenRouter key from the OS keychain once. It's stored out
  // of process so we can't read it synchronously.
  useEffect(() => {
    let live = true;
    void window.idex.keychain.get("openrouter-api-key").then((v) => {
      if (live && typeof v === "string") setOrKey(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-semibold text-2xl text-text-primary inline-flex items-center gap-2">
          <Shield className="size-5 text-accent" />
          Privacy disclosure
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          We send the minimum needed to make IDEX useful, and we tell you exactly what.
        </p>
      </div>
      <ul className="space-y-3 text-sm text-text-primary">
        <li className="flex gap-3">
          <Sparkles className="size-4 text-accent shrink-0 mt-0.5" />
          <div>
            <strong>Your prompts go to your agent of choice.</strong>{" "}
            <span className="text-text-secondary">
              Claude Code talks to Anthropic. Codex to OpenAI. Freebuff to Codebuff. We
              do not store or transmit those prompts ourselves.
            </span>
          </div>
        </li>
        <li className="flex gap-3">
          <Sparkles className="size-4 text-accent shrink-0 mt-0.5" />
          <div>
            <strong>The Curator (optional) reads recent turns to build a feed.</strong>{" "}
            <span className="text-text-secondary">
              When enabled, your last few messages are sent to OpenRouter (GLM-4.6) and
              keyword-derived queries are sent to Composio (X search). You can disable
              the Curator entirely from Settings.
            </span>
          </div>
        </li>
        <li className="flex gap-3">
          <Sparkles className="size-4 text-accent shrink-0 mt-0.5" />
          <div>
            <strong>Your secrets stay in your OS keychain.</strong>{" "}
            <span className="text-text-secondary">
              API keys never touch our servers — there are no IDEX servers.
            </span>
          </div>
        </li>
      </ul>
      <p className="text-xs text-text-secondary leading-relaxed bg-ink-1 border border-line rounded-lg p-3">
        ⚠️ Avoid pasting secrets directly into prompts. Curator queries derived from your
        prompts may be sent to third parties.{" "}
        <button
          className="text-accent underline-offset-2 hover:underline inline-flex items-center gap-1"
          onClick={openExternal("https://github.com/Manueldav2/idex#privacy")}
        >
          Read the privacy policy <ExternalLink className="size-3" />
        </button>
      </p>
      {/*
        X (Twitter) API bearer token. Optional. When present, the
        curator calls api.x.com/2/tweets/search/recent in parallel with
        HN / Reddit / Bluesky so the feed can surface real tweets.
        Without it we silently skip X and the feed still works with the
        other three sources.
      */}
      <div className="space-y-2">
        <label className="text-[13px] font-medium text-text-primary tracking-[-0.005em]">
          X (Twitter) API Bearer Token{" "}
          <span className="text-text-tertiary font-normal">— optional</span>
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onBlur={() => {
            void patch({ xBearerToken: token.trim() ? token.trim() : null });
          }}
          placeholder="Paste your X API v2 bearer token"
          className="w-full rounded-lg bg-ink-2 border border-line px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary/70 font-mono focus:outline-none focus:border-accent/60 transition-colors"
        />
        <p className="text-[11.5px] text-text-tertiary leading-relaxed">
          Without this the feed pulls from HN, Reddit, and Bluesky. Add a
          token from{" "}
          <button
            className="text-accent underline-offset-2 hover:underline"
            onClick={openExternal("https://developer.x.com/en/portal/dashboard")}
          >
            developer.x.com
          </button>{" "}
          to surface real X posts.
        </p>
      </div>

      {/*
        OpenRouter API key. With this, an LLM reads the conversation
        and writes the feed queries — drastically better relevance than
        the naive token extractor. Stored in the OS keychain, never in
        plaintext config.
      */}
      <div className="space-y-2">
        <label className="text-[13px] font-medium text-text-primary tracking-[-0.005em]">
          OpenRouter API Key{" "}
          <span className="text-text-tertiary font-normal">— optional</span>
        </label>
        <input
          type="password"
          value={orKey}
          onChange={(e) => setOrKey(e.target.value)}
          onBlur={() => {
            void window.idex.keychain.set("openrouter-api-key", orKey.trim());
          }}
          placeholder="sk-or-v1-..."
          className="w-full rounded-lg bg-ink-2 border border-line px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary/70 font-mono focus:outline-none focus:border-accent/60 transition-colors"
        />
        <p className="text-[11.5px] text-text-tertiary leading-relaxed">
          With this set, an agent reads your conversation and plans the
          feed queries instead of the naive keyword extractor. Get a key
          at{" "}
          <button
            className="text-accent underline-offset-2 hover:underline"
            onClick={openExternal("https://openrouter.ai/keys")}
          >
            openrouter.ai/keys
          </button>
          . Uses Gemini Flash (~$0.001 per feed refresh).
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button size="lg" onClick={onAccept}>
          I understand — get me to the cockpit
        </Button>
      </div>
    </div>
  );
}
