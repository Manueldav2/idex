import { motion } from "framer-motion";

export function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "You prompt.",
      body: "Type whatever you would type in Claude Code, Codex, or Freebuff. Your agent lives inside a clean cockpit with its own shortcuts.",
    },
    {
      num: "02",
      title: "It reads the room.",
      body: "A small open weight model glances at your last turns, picks the thread, and turns it into searches worth running.",
    },
    {
      num: "03",
      title: "A feed arrives.",
      body: "Picture in picture. Images, video, threads from X. Tangential to what you asked, not repetitive of what you already know.",
    },
    {
      num: "04",
      title: "Your reply lands.",
      body: "The feed retreats, the cockpit reclaims the screen, and the answer is sitting there. You kept your context. You kept your eyes busy.",
    },
  ];
  return (
    <section id="work" className="py-32 md:py-48 rule-top">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="grid md:grid-cols-[1fr_2fr] gap-12 md:gap-20 items-start">
          <div className="md:sticky md:top-28">
            <div className="section-number mb-4">how it works</div>
            <h2 className="display font-normal text-text-primary text-[clamp(40px,5vw,72px)]">
              Four <span className="display-serif text-accent">moments.</span>
            </h2>
            <p className="mt-5 text-text-secondary text-[16px] leading-relaxed max-w-md">
              From the first keystroke to the answer waiting for you when you look back.
            </p>
          </div>
          <div className="space-y-12 md:space-y-20">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
                className="grid grid-cols-[auto_1fr] gap-8 md:gap-10"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-tertiary pt-2">
                  {s.num}
                </span>
                <div>
                  <h3 className="display font-normal text-text-primary text-[clamp(28px,3.2vw,44px)] leading-tight">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-text-secondary text-[16px] leading-relaxed max-w-lg">
                    {s.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AgentsSection() {
  const agents = [
    {
      name: "Claude Code",
      one: "Anthropic, terminal native.",
      install: "npm i -g @anthropic-ai/claude-code",
      status: "Live.",
    },
    {
      name: "Codex",
      one: "OpenAI, multi step plans.",
      install: "npm i -g @openai/codex",
      status: "Next.",
    },
    {
      name: "Freebuff",
      one: "Codebuff, free and ad supported.",
      install: "npm i -g freebuff",
      status: "After that.",
    },
  ];
  return (
    <section id="agents" className="py-32 md:py-44 rule-top atmosphere">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="flex items-baseline gap-6 mb-16">
          <span className="section-number">02 · agents</span>
          <h2 className="display font-normal text-text-primary text-[clamp(40px,5vw,76px)]">
            Pick one. Or all of them.
          </h2>
        </div>
        <div className="divide-y divide-line rule-top rule-bottom">
          {agents.map((a) => (
            <motion.div
              key={a.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5 }}
              className="grid md:grid-cols-[1fr_1.5fr_auto_auto] items-baseline gap-6 py-8 group hover:bg-ink-1/30 transition-colors px-2"
            >
              <h3 className="display text-[clamp(28px,3vw,44px)] text-text-primary">{a.name}</h3>
              <p className="text-text-secondary text-[15px] leading-snug">{a.one}</p>
              <code className="font-mono text-[11px] text-text-secondary bg-ink-1/60 px-2.5 py-1.5 rounded border border-line whitespace-nowrap">
                {a.install}
              </code>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary group-hover:text-accent transition-colors">
                {a.status}
              </span>
            </motion.div>
          ))}
        </div>
        <p className="mt-12 text-text-secondary text-[15px] max-w-xl">
          Your API keys stay in your keychain. Nothing runs through our servers,
          because we don&apos;t have servers.
        </p>
      </div>
    </section>
  );
}

export function FreeOSSSection() {
  return (
    <section className="py-32 md:py-44 rule-top">
      <div className="max-w-[1400px] mx-auto px-8 grid md:grid-cols-[1.3fr_1fr] gap-12 md:gap-20 items-end">
        <div>
          <div className="section-number mb-4">03 · the bargain</div>
          <h2 className="display font-normal text-text-primary text-[clamp(44px,5.5vw,96px)] leading-[0.95]">
            Tools should be
            <br />
            <span className="display-serif text-accent">free.</span>
          </h2>
          <p className="mt-8 max-w-lg text-text-primary/80 text-[17px] leading-relaxed">
            Students, indie devs, teams with no budget. Everyone deserves
            a cockpit. We fund it with contextual sponsored cards sitting
            inside the feed. Never beside your agent&apos;s reply, never
            dressed up as content.
          </p>
          <p className="mt-4 max-w-lg text-text-secondary text-[15px] leading-relaxed">
            Ads can be toggled off in a single click. The product keeps working.
          </p>
        </div>
        <a
          href="https://github.com/Manueldav2/idex"
          target="_blank"
          rel="noreferrer"
          className="press-feedback block border border-line rounded-xl p-8 bg-ink-1/50 hover:border-accent/40 transition-colors group"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-tertiary mb-4">
            github · mit
          </div>
          <div className="display text-[28px] text-text-primary leading-tight">
            Manueldav2 / idex
          </div>
          <div className="mt-6 flex items-center justify-between text-[12px] text-text-secondary">
            <span>Typescript · pnpm · Electron · React</span>
            <span className="text-accent group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
        </a>
      </div>
    </section>
  );
}

export function PrivacySection() {
  return (
    <section className="py-32 md:py-44 rule-top atmosphere">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="section-number mb-4">04 · privacy</div>
        <h2 className="display font-normal text-text-primary text-[clamp(52px,7vw,132px)] leading-[0.92]">
          Local.
          <br />
          <span className="display-serif text-accent">Yours.</span>
          <br />
          Quiet.
        </h2>
        <div className="mt-16 grid md:grid-cols-3 gap-10 md:gap-14 max-w-5xl">
          {[
            {
              h: "Your prompts go to your agent.",
              p: "Claude Code talks to Anthropic. Codex to OpenAI. We are not in the middle.",
            },
            {
              h: "The curator sees what you let it.",
              p: "A short summary of your last few turns, not the code. You can disable it entirely.",
            },
            {
              h: "Keys stay in your keychain.",
              p: "Secrets never touch the disk in plaintext. There are no IDEX accounts.",
            },
          ].map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <h3 className="display text-[22px] text-text-primary leading-snug">{b.h}</h3>
              <p className="mt-3 text-text-secondary text-[14.5px] leading-relaxed">{b.p}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const faqs = [
    {
      q: "Is this just Claude Code with a wrapper?",
      a: "No. Claude Code stays exactly the same. IDEX adds a cockpit around it, a feed beside it, and the ability to run several sessions at once.",
    },
    {
      q: "Will my code leave the machine?",
      a: "Your prompts follow the agent you pick, same as if you ran it in a normal terminal. The curator only sends short topic phrases, and only if you enable it.",
    },
    {
      q: "Why ads?",
      a: "So nobody has to pay, ever. The ads live inside the feed, next to content, not beside the agent. One toggle turns them off.",
    },
    {
      q: "Mac only?",
      a: "For now. Linux and Windows are a matter of bringing node pty up on each, which is paved road.",
    },
    {
      q: "Can I open my repo?",
      a: "Yes. IDEX has an editor mode with a file tree and syntax highlighting. Use it instead of the terminal, or alongside it.",
    },
  ];
  return (
    <section id="faq" className="py-32 md:py-44 rule-top">
      <div className="max-w-[1400px] mx-auto px-8 grid md:grid-cols-[1fr_2fr] gap-12 md:gap-20">
        <div>
          <div className="section-number mb-4">05 · q &amp; a</div>
          <h2 className="display font-normal text-text-primary text-[clamp(40px,5vw,72px)] leading-[0.95]">
            The <span className="display-serif text-accent">obvious</span> ones.
          </h2>
        </div>
        <div className="divide-y divide-line rule-top rule-bottom">
          {faqs.map((f, i) => (
            <details key={i} className="group py-6">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-6">
                <span className="display text-[22px] md:text-[26px] text-text-primary leading-snug">
                  {f.q}
                </span>
                <span className="text-text-secondary font-mono text-sm mt-2 group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-4 text-text-secondary text-[15px] leading-relaxed max-w-2xl">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="py-40 md:py-56 rule-top atmosphere text-center">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="section-number mb-6">06 · the door</div>
        <h2 className="display font-normal text-text-primary text-[clamp(56px,9vw,168px)] leading-[0.9]">
          Bring a <span className="display-serif text-accent">prompt.</span>
        </h2>
        <p className="mt-8 text-text-secondary text-[17px] max-w-md mx-auto">
          macOS 13 or later. Apple Silicon. Free, always.
        </p>
        <div className="mt-12 flex items-center justify-center gap-5">
          <a
            href="https://github.com/Manueldav2/idex/releases/latest"
            className="press-feedback inline-flex items-center gap-2 bg-paper text-ink-0 px-7 py-4 rounded-full text-[15px] font-semibold tracking-tight"
          >
            Install IDEX
            <span className="font-mono text-[12px] text-ink-0/50">↓</span>
          </a>
          <a
            href="https://github.com/Manueldav2/idex"
            target="_blank"
            rel="noreferrer"
            className="press-feedback text-[14px] font-medium text-text-primary hover:text-accent transition-colors"
          >
            Read the source →
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="rule-top py-14">
      <div className="max-w-[1400px] mx-auto px-8 grid md:grid-cols-3 gap-8 items-end text-[12px] text-text-tertiary">
        <div className="flex items-center gap-3">
          <span className="display text-[16px] text-text-primary">idex</span>
          <span>© 2026</span>
        </div>
        <div className="text-center font-mono uppercase tracking-[0.2em]">
          made in a terminal
        </div>
        <div className="flex items-center gap-5 md:justify-end">
          <a href="https://github.com/Manueldav2/idex" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">Source</a>
          <a href="https://github.com/Manueldav2/idex/blob/master/docs/specs/2026-04-19-idex-design.md" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">Spec</a>
          <a href="https://github.com/Manueldav2/idex/issues" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">Issues</a>
        </div>
      </div>
    </footer>
  );
}
