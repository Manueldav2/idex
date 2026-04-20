import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IPC,
  type AgentSpawnOptions,
  type AgentInput,
  type AgentResize,
  type AppConfig,
  type KeychainKey,
} from "@idex/types";
import { agentHost } from "./agent-host.js";
import { configStore } from "./config-store.js";
import { keychain } from "./keychain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env["VITE_DEV_SERVER_URL"];

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0A0B0E",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (isDev) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"] as string);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_, code, desc, url) => {
    console.error("[idex] did-fail-load", { code, desc, url });
  });
  mainWindow.webContents.on("render-process-gone", (_, details) => {
    console.error("[idex] render-process-gone", details);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    agentHost.killAll();
  });
}

function registerIpc() {
  agentHost.setCallbacks({
    onOutput: (chunk) => mainWindow?.webContents.send(IPC.AGENT_OUTPUT_STREAM, chunk),
    onState: (event) => mainWindow?.webContents.send(IPC.AGENT_STATE, event),
  });

  ipcMain.handle(IPC.CONFIG_GET, async () => configStore.read());
  ipcMain.handle(IPC.CONFIG_SET, async (_, patch: Partial<AppConfig>) => configStore.merge(patch));
  ipcMain.handle(IPC.KEYCHAIN_GET, async (_, key: KeychainKey) => keychain.get(key));
  ipcMain.handle(IPC.KEYCHAIN_SET, async (_, key: KeychainKey, value: string) => keychain.set(key, value));

  ipcMain.handle(IPC.AGENT_SPAWN, async (_, opts: AgentSpawnOptions) => agentHost.spawn(opts));
  ipcMain.handle(IPC.AGENT_INPUT, async (_, input: AgentInput) => {
    agentHost.write(input.sessionId, input.text);
  });
  ipcMain.handle(IPC.AGENT_RESIZE, async (_, r: AgentResize) => {
    agentHost.resize(r.sessionId, r.cols, r.rows);
  });
  ipcMain.handle(IPC.AGENT_KILL, async (_, sessionId: string) => agentHost.kill(sessionId));
  ipcMain.handle(IPC.SESSION_LIST, async () => agentHost.list());

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_, url: string) => {
    if (!url || typeof url !== "string") return false;
    if (!/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";
  registerIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  agentHost.killAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => agentHost.killAll());
