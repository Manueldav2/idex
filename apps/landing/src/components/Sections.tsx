import { Brain, Zap, Eye, GitBranch, Heart, Shield, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  primary,
  secondary,
  children,
  reverse,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  children?: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="py-24 md:py-32 border-b border-line">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          {eyebrow && (
            <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-accent mb-3">
              {eyebrow}
            </div>
          )}
          <h2 className="font-display font-bold text-3xl md:text-5xl tracking-[-0.02em] text-text-primary">
            <span className="block">{title.split(".")[0] && title.split(".")[0] + "."}</span>
            {title.split(".")[1] && (
              <span className="block text-text-secondary mt-1 font-medium">{title.split(".").slice(1).join(".").trim()}</span>
            )}
          </h2>
          {subtitle && (
            <p className="mt-5 max-w-2xl mx-auto text-text-secondary text-base md:text-lg leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {(primary || secondary) && (
          <div className={`grid lg:grid-cols-2 gap-10 items-center ${reverse ? "lg:[&>div:first-child]:order-2" : ""}`}>
            <div className="space-y-4">{primary}</div>
            <div>{secondary}</div>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  const steps = [
    {
      icon: Brain,
      title: "1. You prompt your agent.",
      body: "Type whatever you'd type in Claude Code, Codex, or Freebuff — IDEX hosts it natively in a clean cockpit.",
    },
    {
      icon: Zap,
      title: "2. Curator reads your context.",
      body: "A small open-source model summarizes the last few turns and predicts adjacent topics worth surfacing.",
    },
    {
      icon: Eye,
      title: "3. Feed expands while you wait.",
      body: "A picture-to-picture scroll feed slides in — short videos, screenshots, threads, all relevant to what you just asked.",
    },
    {
      icon: GitBranch,
      title: "4. Agent finishes. Cockpit reclaims.",
      body: "The feed retreats to a peek strip, the cockpit takes back the main view with the agent's full reply rendered cleanly.",
    },
  ];
  return (
    <Section id="how" eyebrow="How it works" title="The wait becomes the feature.">
      <div className="grid md:grid-cols-2 gap-5 mt-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-2xl border border-line bg-ink-1 p-7 hover:border-accent/40 transition-colors"
          >
            <s.icon className="size-5 text-accent mb-4" />
            <h3 className="font-display font-semibold text-xl text-text-primary mb-2 tracking-tight">{s.title}</h3>
            <p className="text-text-secondary leading-relaxed">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

export function AgentsSection() {
  const agents = [
    { name: "Claude Code", install: "npm install -g @anthropic-ai/claude-code", status: "Live in v1.0" },
    { name: "Codex", install: "npm install -g @openai/codex", status: "Phase 2" },
    { name: "Freebuff", install: "npm install -g freebuff", status: "Phase 3" },
  ];
  return (
    <Section
      id="agents"
      eyebrow="Three agents, one cockpit"
      title="Pick your fighter."
      subtitle="Switch agents in one click. IDEX owns the I/O stream so the curator gets context regardless of which CLI you're using."
    >
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        {agents.map((a, i) => (
          <motion.div
            key={a.name}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="rounded-2xl border border-line bg-ink-1 p-6 group hover:border-accent/40 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-lg text-text-primary">{a.name}</h3>
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary px-2 py-0.5 rounded border border-line">
                {a.status}
              </span>
            </div>
            <code className="block text-[11px] font-mono text-text-secondary bg-ink-0 px-2.5 py-1.5 rounded border border-line break-all">
              {a.install}
            </code>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

export function FreeOSSSection() {
  return (
    <Section
      eyebrow="Free, open source, ad-supported"
      title="Tools should be free. Devs deserve a clean ad model."
      subtitle="IDEX is MIT-licensed, hosted on GitHub, and powered by trygravity.ai's contextual ad SDK — built specifically for AI surfaces. Ads sit in the feed, never in your agent output."
      primary={
        <ul className="space-y-3 text-text-primary">
          <Li>Free forever. No subscriptions, no per-seat charges.</Li>
          <Li>You bring your own API keys; tokens at provider cost.</Li>
          <Li>Curator, feed, and ads all toggleable in Settings.</Li>
          <Li>Source on GitHub — fork it, audit it, ship a PR.</Li>
        </ul>
      }
      secondary={
        <a
          href="https://github.com/Manueldav2/idex"
          target="_blank"
          rel="noreferrer"
          className="press-feedback group block rounded-2xl border border-line bg-ink-1 p-8 hover:border-accent/40 transition-colors"
        >
          <Heart className="size-6 text-accent mb-3" />
          <div className="font-display font-semibold text-xl text-text-primary mb-1">github.com/Manueldav2/idex</div>
          <div className="text-text-secondary text-sm">MIT license · pnpm + Electron + React 19</div>
          <div className="mt-4 inline-flex items-center gap-1.5 text-accent text-sm font-medium">
            star the repo <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </a>
      }
    />
  );
}

export function PrivacySection() {
  return (
    <Section
      eyebrow="Privacy first"
      title="No servers. No analytics. No surprises."
      subtitle="There are no IDEX servers. Your agent talks directly to its provider. The curator (when enabled) sends keyword-derived queries to OpenRouter and Composio — never your raw code."
      primary={
        <ul className="space-y-3 text-text-primary">
          <Li>API keys live in your OS keychain.</Li>
          <Li>Privacy "panic mode" disables the curator entirely.</Li>
          <Li>Telemetry is opt-in only.</Li>
          <Li>Read the source before you trust it.</Li>
        </ul>
      }
      secondary={
        <div className="rounded-2xl border border-line bg-ink-1 p-8">
          <Shield className="size-6 text-accent mb-3" />
          <p className="text-text-primary text-sm leading-relaxed">
            IDEX shows a one-time disclosure on first run that names every external service it
            talks to. You accept once, change your mind anytime in Settings.
          </p>
        </div>
      }
    />
  );
}

export function FaqSection() {
  const faqs = [
    {
      q: "What does IDEX cost?",
      a: "Free, MIT licensed. You bring your own API keys for your agent (Anthropic / OpenAI / Codebuff) and optionally OpenRouter (for the curator). Tokens at provider cost.",
    },
    {
      q: "Is the feed actually relevant?",
      a: "Yes — the curator extracts topics from your conversation (and adjacent ones — building cold email infra surfaces deliverability tips, not random Twitter noise). v1.0 ships with a starter feed; the live X integration lights up in Phase 2.",
    },
    {
      q: "Will my code get sent anywhere?",
      a: "Your prompts go to your agent of choice (same as if you were running the CLI directly). The curator sends short topic phrases to OpenRouter/Composio when enabled. You can disable the curator entirely from Settings.",
    },
    {
      q: "Why ads?",
      a: "Ads make IDEX free for everyone, including students and indie devs. We use trygravity.ai — a contextual ad network designed for AI products — and slot ads only in the feed pane (never adjacent to agent output). Toggle off in Settings if you prefer.",
    },
    {
      q: "Mac only?",
      a: "macOS first. Linux + Windows on the v2 roadmap. The architecture supports them — node-pty + Electron is portable — we just want to ship one platform well first.",
    },
    {
      q: "What's powering it under the hood?",
      a: "Electron (Chromium + Node), React 19, Vite, Tailwind 4, framer-motion, xterm.js, node-pty, keytar. GLM-4.6 via OpenRouter for curator. Composio for X. Aceternity / 21st.dev for the landing animations. All MIT or compatible.",
    },
  ];
  return (
    <Section id="faq" eyebrow="FAQ" title="Frequently asked.">
      <div className="max-w-3xl mx-auto divide-y divide-line border border-line rounded-2xl bg-ink-1 mt-4">
        {faqs.map((f, i) => (
          <details key={i} className="group">
            <summary className="cursor-pointer list-none px-6 py-5 flex items-center justify-between text-text-primary font-display font-semibold text-base hover:bg-ink-2 transition-colors">
              {f.q}
              <span className="text-text-secondary group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-6 pb-5 pt-0 text-text-secondary leading-relaxed">{f.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function FinalCta() {
  return (
    <section className="py-24 md:py-32 text-center subtle-noise">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="font-display font-bold text-text-primary text-4xl md:text-6xl tracking-[-0.03em]">
          Ready to make the wait worth it?
        </h2>
        <p className="mt-5 text-text-secondary text-lg">macOS 13+ · Apple Silicon &amp; Intel · free forever</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="https://github.com/Manueldav2/idex/releases/latest"
            className="press-feedback inline-flex items-center gap-2 bg-accent text-white px-6 py-3.5 rounded-xl text-base font-display font-semibold shadow-[0_8px_24px_rgba(61,123,255,0.3)] hover:brightness-110"
          >
            Download IDEX <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-text-secondary">
        <div className="flex items-center gap-3">
          <pre className="font-mono text-[10px] leading-[10px]">{`┌────┐
│IDEX│
└────┘`}</pre>
          <span>© 2026 IDEX · MIT</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="https://github.com/Manueldav2/idex" target="_blank" rel="noreferrer" className="hover:text-text-primary">GitHub</a>
          <a href="https://github.com/Manueldav2/idex/blob/main/docs/specs/2026-04-19-idex-design.md" target="_blank" rel="noreferrer" className="hover:text-text-primary">Spec</a>
          <a href="https://github.com/Manueldav2/idex/issues" target="_blank" rel="noreferrer" className="hover:text-text-primary">Issues</a>
        </div>
      </div>
    </footer>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="text-accent mt-1 select-none">▸</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
