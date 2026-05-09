import { motion } from "framer-motion";
import { ClaudeWelcomePanel } from "./ScrollThroughDemo";

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

        <div className="flex-1 px-4 py-3 font-mono text-[11px] leading-[1.6] overflow-hidden text-text-primary">
          <ClaudeWelcomePanel
            greeting="Welcome back Manuel!"
            email="you@example.com"
            cwd="~/idex"
          />

          {/* Tip line under the banner — matches Claude Code's actual boot. */}
          <div className="mt-3" style={{ color: "#7d6552" }}>
            ※ Tip: Ask Claude about your code, your stack, anything.
          </div>

          {/* User prompt — orange ›, white prompt text */}
          <div className="mt-4" style={{ color: "#fff" }}>
            <span style={{ color: "#D87C4A" }}>{"›"}</span>{" "}
            <span>fix my cold-email deliverability — emails are going to spam</span>
          </div>

          {/* Tool-use block — Claude Code renders bullet bullets and grey body */}
          <div className="mt-4 space-y-1">
            <div className="text-text-secondary">
              I'll diagnose this in three passes — DNS records, content, and sending reputation.
            </div>
            <div className="mt-2">
              <span style={{ color: "#5EEAD4" }}>●</span>{" "}
              <span style={{ color: "#fff" }}>Bash</span>
              <span className="text-text-secondary">(dig +short txt mailgun._domainkey.example.com)</span>
              <div className="ml-3 text-text-tertiary text-[10.5px] mt-0.5">
                ⎿ k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBi…
              </div>
            </div>
            <div className="mt-2">
              <span style={{ color: "#5EEAD4" }}>●</span>{" "}
              <span style={{ color: "#fff" }}>Read</span>
              <span className="text-text-secondary">(spf-checker.ts, dmarc-policy.ts)</span>
              <div className="ml-3 text-text-tertiary text-[10.5px] mt-0.5">
                ⎿ Read 142 lines · 2 records flagged
              </div>
            </div>
          </div>

          <div className="mt-3 text-text-secondary">Found 3 issues:</div>
          <div className="mt-1 space-y-0.5">
            <div>
              <span style={{ color: "#FBBF24" }}>●</span>{" "}
              SPF includes too many lookups <span className="text-text-tertiary">(12 of 10)</span>
            </div>
            <div>
              <span style={{ color: "#FBBF24" }}>●</span>{" "}
              DKIM key is 1024-bit <span className="text-text-tertiary">(should be 2048)</span>
            </div>
            <div>
              <span style={{ color: "#FBBF24" }}>●</span>{" "}
              DMARC policy is{" "}
              <span style={{ color: "#fff" }}>p=none</span>
              <span className="text-text-tertiary"> (recommend p=quarantine)</span>
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-2" style={{ color: "#9ca3af" }}>
            <span className="dot-soft-pulse inline-block size-1.5 rounded-full bg-accent" />
            <span className="italic">Drafting fixes…</span>
            <span className="text-text-tertiary text-[10px]">(esc to interrupt)</span>
          </div>
        </div>

        {/* Composer footer — Claude Code's actual prompt bar */}
        <div className="border-t border-line bg-ink-0 px-4 py-2.5 font-mono text-[11px]">
          <div className="flex items-baseline gap-2" style={{ color: "#fff" }}>
            <span style={{ color: "#D87C4A" }}>{"›"}</span>
            <span className="opacity-60">apply the three fixes you suggested</span>
            <span className="streaming-caret inline-block w-[6px] h-[12px] bg-accent ml-0.5 align-text-bottom" />
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[9.5px]" style={{ color: "#7d6552" }}>
            <span>↵ send</span>
            <span>·</span>
            <span>shift+tab cycle modes</span>
            <span>·</span>
            <span>/help commands</span>
          </div>
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
