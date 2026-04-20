import { useCallback, useEffect, useRef } from "react";
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNs } from "monaco-editor";
import { useWorkspace, type OpenFile } from "@/store/workspace";

// Vite bundles each Monaco worker as a real worker chunk via `?worker`. We
// point MonacoEnvironment.getWorker at the matching bundle per language label.
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

interface MonacoEnvGlobal {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
}

/**
 * Point @monaco-editor/react at the bundled `monaco-editor` package so Vite
 * resolves worker assets locally rather than pulling the CDN build (the CSP
 * in index.html doesn't allow random script origins, and we want to work
 * offline). We also register MonacoEnvironment up-front so Monaco uses our
 * pre-bundled worker chunks instead of the default AMD loader.
 */
let monacoConfigured = false;
function configureMonaco() {
  if (monacoConfigured) return;
  monacoConfigured = true;
  (self as unknown as MonacoEnvGlobal).MonacoEnvironment = {
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
  // Dynamic import so Vite can code-split the Monaco bundle out of the
  // initial JS payload.
  void import("monaco-editor").then((mod) => {
    loader.config({ monaco: mod });
  });
}

const IDEX_THEME: MonacoEditorNs.IStandaloneThemeData = {
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

interface Props {
  file: OpenFile;
}

export function Editor({ file }: Props) {
  const updateContent = useWorkspace((s) => s.updateContent);
  const save = useWorkspace((s) => s.save);
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);

  // Ensure Monaco boots lazily on first mount.
  useEffect(() => {
    configureMonaco();
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme("idex-dark", IDEX_THEME);
    monaco.editor.setTheme("idex-dark");
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
