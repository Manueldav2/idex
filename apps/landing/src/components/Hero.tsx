import { Download, Github, Sparkles } from "lucide-react";
import { ContainerScroll } from "./ContainerScroll";
import { CockpitDemo } from "./CockpitDemo";

export function Hero() {
  return (
    <section className="relative subtle-noise pt-32 md:pt-40 pb-12">
      <ContainerScroll
        titleComponent={
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-ink-1/50 text-[12px] font-mono text-text-secondary">
              <Sparkles className="size-3 text-accent" />
              Free · Open source · Ad-supported
            </div>
            <h1 className="font-display font-bold text-text-primary tracking-[-0.04em] text-5xl md:text-7xl leading-[1.02]">
              Code while you scroll.
            </h1>
            <p className="text-text-secondary text-lg md:text-2xl tracking-tight max-w-2xl mx-auto leading-snug">
              The IDE that watches the wait. A picture-to-picture cockpit for your coding agent.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pb-4">
              <a
                href="https://github.com/Manueldav2/idex/releases/latest"
                className="press-feedback inline-flex items-center gap-2 bg-accent text-white px-5 py-3 rounded-xl text-[14px] font-display font-semibold shadow-[0_8px_24px_rgba(61,123,255,0.3)] hover:brightness-110"
              >
                <Download className="size-4" /> Download for Mac
              </a>
              <a
                href="https://github.com/Manueldav2/idex"
                target="_blank"
                rel="noreferrer"
                className="press-feedback inline-flex items-center gap-2 border border-line bg-ink-1/60 text-text-primary px-5 py-3 rounded-xl text-[14px] font-display font-semibold hover:bg-ink-2"
              >
                <Github className="size-4" /> View source
              </a>
            </div>
          </div>
        }
      >
        <CockpitDemo />
      </ContainerScroll>
    </section>
  );
}
