import { motion } from "framer-motion";

/**
 * A static-but-animated representation of the IDEX cockpit, displayed
 * inside the ContainerScroll device frame on the landing page.
 * Real product video can replace this in v1.1.
 */
export function CockpitDemo() {
  return (
    <div className="grid grid-cols-[1fr_280px] h-full bg-ink-0 text-text-primary">
      {/* Cockpit (left) */}
      <div className="flex flex-col border-r border-line">
        <div className="glass flex items-center justify-between border-b border-line px-4 h-10">
          <pre className="font-mono text-[8px] leading-[8px] text-text-secondary">{`┌────┐
│IDEX│
└────┘`}</pre>
          <div className="text-[10px] font-mono text-text-secondary">
            <span className="text-text-primary font-medium">Claude Code</span> · ~/idex
          </div>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-accent-soft text-accent">
            generating…
          </span>
        </div>

        <div className="flex-1 px-4 py-3 font-mono text-[11px] leading-relaxed overflow-hidden">
          <div className="text-text-secondary mb-1">Claude Code · 14:32</div>
          <div className="text-text-primary mb-2">
            <span className="text-accent">›</span> fix my cold-email deliverability — emails are going to spam
          </div>
          <div className="text-text-primary opacity-90">
            I'll diagnose this in three passes — DNS records, content, and sending reputation.
            <br />
            <span className="text-text-secondary">$ dig +short txt mailgun._domainkey.example.com</span>
            <br />
            <span className="text-text-secondary">$ checking SPF, DKIM, DMARC...</span>
            <br />
            <br />
            Found 3 issues:
            <br />
            • SPF includes too many lookups (12 of 10)
            <br />
            • DKIM key is 1024-bit (should be 2048)
            <br />
            • DMARC policy is p=none (recommend p=quarantine)
            <br />
            <span className="streaming-caret inline-block w-1.5 h-3 bg-accent ml-0.5" />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 flex items-center gap-2 text-[10px] text-text-secondary">
          <span className="text-accent">›</span>
          <span className="opacity-50">agent is generating — esc to cancel...</span>
        </div>
      </div>

      {/* Feed (right) */}
      <div className="flex flex-col bg-ink-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-line text-[9px] font-mono text-text-secondary uppercase tracking-wider">
          Curator · 4 cards
        </div>
        <div className="flex-1 p-3 space-y-3 overflow-hidden">
          {[
            { title: "Why your DKIM should be 2048-bit in 2026", author: "@emailgeeks" },
            { title: "DMARC quarantine vs reject — when to switch", author: "@valimail" },
            { title: "SPF flattening tools that actually work", author: "@cloudflare" },
            { title: "Inbox warmup myths debunked", author: "@instantly" },
          ].map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: i === 0 ? 1 : 0.7, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className={`rounded-lg border p-2.5 bg-ink-1 ${
                i === 0 ? "border-accent shadow-[0_0_0_1px_rgba(61,123,255,0.4)]" : "border-line"
              }`}
            >
              <div className="text-[10px] font-mono text-text-secondary mb-1">{c.author}</div>
              <div className="text-[11px] text-text-primary leading-snug">{c.title}</div>
              <div className="mt-1.5 text-[8px] italic text-text-secondary">
                <span className="text-accent not-italic">why —</span> deliverability context
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
