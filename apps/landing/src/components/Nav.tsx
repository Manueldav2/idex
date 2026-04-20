import { Github, Download } from "lucide-react";

export function Nav() {
  return (
    <nav className="glass fixed top-0 inset-x-0 z-40 border-b border-line">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 group">
          <pre className="font-mono text-[10px] leading-[10px] text-text-secondary group-hover:text-accent transition-colors">{`┌────┐
│IDEX│
└────┘`}</pre>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-text-secondary">
          <a href="#how" className="hover:text-text-primary transition-colors">How it works</a>
          <a href="#agents" className="hover:text-text-primary transition-colors">Agents</a>
          <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
          <a
            href="https://github.com/Manueldav2/idex"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text-primary transition-colors inline-flex items-center gap-1.5"
          >
            <Github className="size-4" /> GitHub
          </a>
        </div>
        <a
          href="https://github.com/Manueldav2/idex/releases/latest"
          className="press-feedback inline-flex items-center gap-1.5 bg-accent text-white px-3.5 py-1.5 rounded-lg text-[13px] font-display font-semibold shadow-[0_4px_12px_rgba(61,123,255,0.25)] hover:brightness-110"
        >
          <Download className="size-3.5" /> Download
        </a>
      </div>
    </nav>
  );
}
