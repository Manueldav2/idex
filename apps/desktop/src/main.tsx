import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { installTauriBridge, isTauri } from "./lib/ipc-tauri";

/**
 * Pick the right IPC backend before React mounts. Under Electron the
 * preload script has already installed `window.idex` synchronously, so
 * we have nothing to do. Under Tauri we install our parallel bridge
 * (Tauri's invoke + listen wrapped to match the same shape) and wait
 * for it to resolve before rendering — the renderer assumes
 * `window.idex` exists from the first React effect.
 */
async function bootstrap() {
  if (isTauri()) {
    await installTauriBridge();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
