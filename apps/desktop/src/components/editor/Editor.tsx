import { useCallback, useEffect, useRef, useState } from "react";
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react";
// We statically import the whole monaco-editor package and hand it to the
// loader BEFORE any editor mounts. If we were to rely on the default loader,
// `@monaco-editor/react` would try to fetch https://cdn.jsdelivr.net/... which
// is blocked by our CSP (`default-src 'self'`) and also unavailable offline.
import * as monaco from "monaco-editor";

// Vite bundles each Monaco worker as a real worker chunk via `?worker`. We
// point MonacoEnvironment.getWorker at the matching bundle per language label.
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import { useWorkspace, type OpenFile } from "@/store/workspace";

interface MonacoEnvGlobal {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
}

/**
 * Wire up Monaco for a packaged Electron app running under `file://`.
 *
 * This MUST run at module import time — before any `<MonacoEditor />` renders —
 * because `@monaco-editor/react` kicks off its own loader the moment the
 * component mounts. If `loader.config({ monaco })` has not been called by
 * then, it falls back to fetching from jsdelivr, which our CSP blocks and
 * which doesn't work offline anyway. Putting this in a `useEffect` was the
 * root cause of the "editor hangs on spinner" bug.
 */
(function bootstrapMonacoOnce() {
  const g = self as unknown as MonacoEnvGlobal & {
    __idexMonacoBooted?: boolean;
  };
  if (g.__idexMonacoBooted) return;
  g.__idexMonacoBooted = true;

  g.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      switch (label) {
        case "json":
          return new JsonWorker();
        case "css":
        case "scss":
        case "less":
          return new CssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new HtmlWorker();
        case "typescript":
        case "javascript":
          return new TsWorker();
        default:
          return new EditorWorker();
      }
    },
  };

  // Hand the bundled monaco instance to @monaco-editor/react so it skips
  // its CDN loader entirely.
  loader.config({ monaco });
})();

const IDEX_THEME: monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0A0B0E",
    "editor.foreground": "#F2F4F7",
    "editorLineNumber.foreground": "#414654",
    "editorLineNumber.activeForeground": "#8B92A5",
    "editorCursor.foreground": "#3D7BFF",
    "editor.selectionBackground": "#3D7BFF40",
    "editor.inactiveSelectionBackground": "#3D7BFF20",
    "editor.lineHighlightBackground": "#13151B",
    "editor.lineHighlightBorder": "#13151B",
    "editorIndentGuide.background1": "#1C1F28",
    "editorIndentGuide.activeBackground1": "#22252F",
    "editorGutter.background": "#0A0B0E",
    "editorWidget.background": "#13151B",
    "editorWidget.border": "#22252F",
    "scrollbarSlider.background": "#FFFFFF10",
    "scrollbarSlider.hoverBackground": "#FFFFFF20",
    "scrollbarSlider.activeBackground": "#FFFFFF30",
  },
};

// Define the theme once, as soon as monaco is available, so it's ready the
// instant the first editor mounts (avoids a flash of the default vs-dark).
try {
  monaco.editor.defineTheme("idex-dark", IDEX_THEME);
} catch {
  // Some HMR paths re-execute module code; defineTheme tolerates duplicates
  // but we swallow any transient error to keep module init resilient.
}

interface Props {
  file: OpenFile;
}

export function Editor({ file }: Props) {
  const updateContent = useWorkspace((s) => s.updateContent);
  const save = useWorkspace((s) => s.save);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Safety net: if Monaco has not mounted after 3 seconds, swap to a plain
  // textarea so the user is never staring at a spinner forever. This is a
  // last-resort escape hatch — with the loader wired correctly above, it
  // should essentially never trigger.
  const [mounted, setMounted] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (mounted) return;
    const timer = window.setTimeout(() => {
      if (!mounted) {
        console.warn("[idex] Monaco did not mount within 3s; falling back to textarea.");
        setFallback(true);
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [mounted]);

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoInstance.editor.defineTheme("idex-dark", IDEX_THEME);
    monacoInstance.editor.setTheme("idex-dark");
    setMounted(true);
  }, []);

  // Wire ⌘S / Ctrl+S to save the active file. We use a capturing key handler
  // at the window level so it works whether focus is inside Monaco or on the
  // surrounding chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key !== "s" && e.key !== "S") return;
      e.preventDefault();
      void save(file.path);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file.path, save]);

  if (fallback) {
    return (
      <div className="relative flex-1 min-h-0 bg-ink-0 flex flex-col">
        <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.24em] text-amber-400/80 border-b border-line shrink-0">
          editor fallback · monaco unavailable
        </div>
        <textarea
          spellCheck={false}
          value={file.content}
          onChange={(e) => updateContent(file.path, e.target.value)}
          className="flex-1 min-h-0 w-full resize-none bg-ink-0 text-text-primary font-mono text-[13px] leading-[1.55] px-4 py-3 outline-none border-0"
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
            tabSize: 2,
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-ink-0">
      <MonacoEditor
        height="100%"
        width="100%"
        theme="idex-dark"
        path={file.path}
        language={file.modelLanguage}
        value={file.content}
        onChange={(value) => updateContent(file.path, value ?? "")}
        onMount={handleMount}
        loading={<EditorLoading />}
        options={{
          fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.55,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          cursorBlinking: "smooth",
          fontLigatures: true,
          tabSize: 2,
          wordWrap: "off",
          padding: { top: 12, bottom: 12 },
          stickyScroll: { enabled: false },
          guides: { indentation: true, highlightActiveIndentation: true },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
          },
        }}
      />
    </div>
  );
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-0">
      <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-text-secondary animate-pulse">
        loading editor…
      </span>
    </div>
  );
}
