import { ScrollMorphHero } from "./ScrollMorphHero";

export function Hero() {
  return (
    <section className="relative">
      <ScrollMorphHero
        titleComponent={
          <div className="space-y-8">
            <div className="section-number">issue 01 · april 2026</div>
            <h1 className="display font-normal text-text-primary text-[clamp(56px,9vw,148px)]">
              Grow
              <br />
              <span className="display-serif text-accent">vertically.</span>
            </h1>
            <p className="mx-auto max-w-xl text-[18px] md:text-[20px] text-text-secondary leading-[1.5]">
              The cockpit for your coding agent. Every second you spend
              waiting on a generation becomes a second you spent learning.
              10x what you create, 10x what you absorb.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <a
                href="https://github.com/Manueldav2/idex/releases/latest"
                className="press-feedback inline-flex items-center gap-2 bg-paper text-ink-0 px-6 py-3 rounded-full text-[14px] font-semibold tracking-tight"
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
                Read the source
              </a>
            </div>
          </div>
        }
      />
    </section>
  );
}
