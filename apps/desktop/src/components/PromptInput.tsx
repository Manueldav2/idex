import { useState, type KeyboardEvent } from "react";
import { useAgent } from "@/store/agent";
import { Send, Square } from "lucide-react";
import { Button } from "./Button";

export function PromptInput() {
  const [value, setValue] = useState("");
  const state = useAgent((s) => s.state);
  const send = useAgent((s) => s.send);
  const kill = useAgent((s) => s.kill);

  const isGenerating = state === "generating";

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
      e.preventDefault();
      void submit();
    }
  };

  const submit = async () => {
    if (!value.trim()) return;
    const t = value;
    setValue("");
    await send(t);
  };

  return (
    <div className="border-t border-line bg-ink-1 px-6 py-4">
      <div className="flex items-end gap-3">
        <span className="text-accent font-mono text-base mt-1.5 select-none">›</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            isGenerating
              ? "agent is generating — Esc to cancel..."
              : "ask, build, debug..."
          }
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-text-primary placeholder:text-text-secondary font-body text-sm leading-relaxed py-1.5 max-h-32"
          disabled={isGenerating}
          autoFocus
        />
        {isGenerating ? (
          <Button variant="ghost" size="sm" onClick={() => void kill()} title="Stop">
            <Square className="size-3.5" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => void submit()} disabled={!value.trim()}>
            <Send className="size-3.5" /> Send
          </Button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-secondary">
        <span>
          <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">↵</kbd> send
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">⇧↵</kbd>{" "}
          newline
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 rounded border border-line font-mono">esc</kbd>{" "}
          cancel
        </span>
      </div>
    </div>
  );
}
