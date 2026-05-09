import { ScrollMorphHero } from "./ScrollMorphHero";

export function Hero() {
  return (
    <section className="relative">
      <ScrollMorphHero
        titleComponent={
          <div className="space-y-8">
            <div className="section-number">issue 01 · may 2026 · open source</div>
            <h1 className="display font-normal text-text-primary text-[clamp(56px,9vw,148px)]">
              Grow
              <br />
              <span className="display-serif text-accent">vertically.</span>
            </h1>
            <p className="mx-auto max-w-xl text-[18px] md:text-[20px] text-text-secondary leading-[1.5]">
              The cockpit for your coding agent. Every second you spend
              waiting on a generation becomes a second you spent learning.
              10× what you create, 10× what you absorb.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <a
                href="https://github.com/Manueldav2/idex/releases/latest"
                className="press-feedback inline-flex items-center gap-2 bg-paper text-ink-0 px-6 py-3 rounded-full text-[14px] font-semibold tracking-tight hover:brightness-95 transition-[filter]"
              >
                Install for Mac
                <span className="font-mono text-[11px] text-ink-0/50">↓</span>
              </a>
              <a
                href="https://github.com/Manueldav2/idex"
                target="_blank"
                rel="noreferrer"
                className="press-feedback inline-flex items-center gap-2 text-[14px] font-medium text-text-primary hover:text-accent transition-colors"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.8 10.9.6.1.8-.2.8-.6v-2.2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.8.9 1.2 2 1.2 3.2 0 4.5-2.7 5.5-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6C20.2 21.4 23.5 17.1 23.5 12 23.5 5.7 18.3.5 12 .5z" />
                </svg>
                Read the source
              </a>
            </div>
            <p className="mx-auto max-w-md text-[12px] text-text-tertiary tracking-wide">
              Apple Silicon · macOS 13+ · MIT licensed · ~24MB
            </p>
          </div>
        }
      />
    </section>
  );
}
