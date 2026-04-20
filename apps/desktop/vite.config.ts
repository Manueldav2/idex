import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
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
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Monaco ships its own web workers (editor + per-language). Vite will hoist
  // them into the bundle when we pre-bundle them here; the worker output is
  // emitted as hashed JS under the normal build `outDir`.
  optimizeDeps: {
    include: [
      "@monaco-editor/react",
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
  },
});
