import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "node:path";

// Tauri sets TAURI_ENV_PLATFORM (and the older TAURI_PLATFORM) before
// invoking the dev command. When that's set we're being driven by
// `tauri dev` and we MUST NOT launch Electron — vite-plugin-electron
// would otherwise spawn an Electron window alongside the Tauri window
// every time we start `pnpm dev:tauri`. Skipping the plugin here is the
// single switch between the two backends.
const RUNNING_UNDER_TAURI =
  !!process.env.TAURI_ENV_PLATFORM || !!process.env.TAURI_PLATFORM;

const electronPlugins = RUNNING_UNDER_TAURI
  ? []
  : [
      electron([
        {
          entry: "electron/main.ts",
          vite: {
            build: {
              outDir: "dist-electron",
              rollupOptions: {
                external: ["electron", "node-pty", "keytar"],
                output: { format: "cjs", entryFileNames: "[name].js" },
              },
            },
          },
        },
        {
          entry: "electron/preload.ts",
          onstart: ({ reload }) => reload(),
          vite: {
            build: {
              outDir: "dist-electron",
              rollupOptions: {
                external: ["electron"],
                output: { format: "cjs", entryFileNames: "[name].js" },
              },
            },
          },
        },
      ]),
      renderer(),
    ];

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), ...electronPlugins],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Monaco ships its own web workers (editor + per-language). Vite will hoist
  // them into the bundle when we pre-bundle them here; the worker output is
  // emitted as hashed JS under the normal build `outDir`. We also pre-bundle
  // the main `monaco-editor` module so `import * as monaco from "monaco-editor"`
  // is ready at module-eval time and we can hand it to @monaco-editor/react's
  // `loader.config` synchronously, skipping its default CDN loader.
  optimizeDeps: {
    include: [
      "@monaco-editor/react",
      "monaco-editor",
      "monaco-editor/esm/vs/editor/editor.worker?worker",
      "monaco-editor/esm/vs/language/json/json.worker?worker",
      "monaco-editor/esm/vs/language/css/css.worker?worker",
      "monaco-editor/esm/vs/language/html/html.worker?worker",
      "monaco-editor/esm/vs/language/typescript/ts.worker?worker",
    ],
  },
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5179,
    // Stop watching the Cargo build output and Tauri's generated files —
    // every cargo-check writes thousands of intermediate files and Vite
    // would otherwise trigger a full page reload on each, churning the
    // Electron renderer for no reason.
    watch: {
      ignored: [
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
        "**/.cargo/**",
      ],
    },
  },
});
