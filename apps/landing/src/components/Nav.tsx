import { Github } from "lucide-react";

export function Nav() {
  return (
    <nav className="glass fixed top-0 inset-x-0 z-40 rule-bottom">
      <div className="max-w-[1400px] mx-auto px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <a href="#" className="flex items-center gap-2.5 group w-fit">
          <span className="display text-[18px] font-medium text-text-primary tracking-tight">
            idex
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary group-hover:text-accent transition-colors">
            v0.1
          </span>
        </a>
        <div className="hidden md:flex items-center gap-10 text-[13px] text-text-secondary font-medium">
          <a href="#work" className="hover:text-text-primary transition-colors">Work</a>
          <a href="#agents" className="hover:text-text-primary transition-colors">Agents</a>
          <a href="#faq" className="hover:text-text-primary transition-colors">Q &amp; A</a>
          <a
            href="https://github.com/Manueldav2/idex"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text-primary transition-colors inline-flex items-center gap-1.5"
          >
            <Github className="size-3.5" /> Source
          </a>
        </div>
        <div className="justify-self-end">
          <a
            href="https://github.com/Manueldav2/idex/releases/latest"
            className="press-feedback inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-paper text-ink-0 text-[12px] font-medium tracking-tight hover:bg-white"
          >
            Install
            <span className="text-ink-0/40 font-mono text-[10px]">↓</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
