import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IPC,
  type AgentSpawnOptions,
  type AgentInput,
  type AgentResize,
  type AppConfig,
  type ExternalAgentLaunchOptions,
  type ComposioConnectXRequest,
  type KeychainKey,
  type ProjectCreateFolderArgs,
  type ProjectCreateFolderResult,
} from "@idex/types";
import { agentHost } from "./agent-host.js";
import { configStore } from "./config-store.js";
import { keychain } from "./keychain.js";
import { workspace } from "./workspace.js";
import { launchExternalAgent } from "./external-agent.js";
import { connectX, readStatus } from "./composio-oauth.js";

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

  ipcMain.handle(IPC.AGENT_LAUNCH_EXTERNAL, async (_, opts: ExternalAgentLaunchOptions) =>
    launchExternalAgent(opts),
  );

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_, url: string) => {
    if (!url || typeof url !== "string") return false;
    if (!/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(IPC.WORKSPACE_OPEN, async () => workspace.openPicker());
  ipcMain.handle(IPC.WORKSPACE_TREE, async (_, rootPath: string) => workspace.loadTree(rootPath));
  ipcMain.handle(IPC.WORKSPACE_READ_FILE, async (_, filePath: string) => workspace.readFile(filePath));
  ipcMain.handle(IPC.WORKSPACE_WRITE_FILE, async (_, filePath: string, content: string) =>
    workspace.writeFile(filePath, content),
  );

  ipcMain.handle(IPC.PROJECTS_CREATE_FOLDER, async (_, args: ProjectCreateFolderArgs) =>
    createProjectFolder(args),
  );

  ipcMain.handle(IPC.COMPOSIO_CONNECT_X, async (_, req: ComposioConnectXRequest) =>
    connectX(req ?? {}),
  );
  ipcMain.handle(IPC.COMPOSIO_STATUS, async () => readStatus());
}

/**
 * Create a new project folder inside `parentDir`. Validation rules:
 *   - `parentDir` must be an absolute path that already exists and is a dir.
 *   - `name` must be non-empty, contain no path separators, and not start
 *     with a dot. This prevents directory traversal and hidden-folder fakes.
 *   - The final path must not already exist as a non-empty directory.
 * The folder is created with `recursive: true` so intermediate parents
 * (if any) are made on demand.
 */
async function createProjectFolder(
  args: ProjectCreateFolderArgs,
): Promise<ProjectCreateFolderResult> {
  const parentDir = args?.parentDir;
  const name = args?.name;
  if (!parentDir || typeof parentDir !== "string") {
    return { ok: false, error: "Missing parent directory" };
  }
  if (!path.isAbsolute(parentDir)) {
    return { ok: false, error: "Parent path must be absolute" };
  }
  if (!name || typeof name !== "string") {
    return { ok: false, error: "Missing folder name" };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "Folder name is empty" };
  if (trimmed.startsWith(".")) return { ok: false, error: "Folder name cannot start with a dot" };
  if (/[\\/]/.test(trimmed)) return { ok: false, error: "Folder name cannot contain slashes" };
  if (/[<>:"|?*\u0000-\u001f]/.test(trimmed)) return { ok: false, error: "Folder name has invalid characters" };

  try {
    const parentStat = await fs.stat(parentDir);
    if (!parentStat.isDirectory()) {
      return { ok: false, error: "Parent path is not a directory" };
    }
  } catch {
    return { ok: false, error: "Parent directory does not exist" };
  }

  const target = path.join(parentDir, trimmed);
  // Guard against resolved paths escaping the parent (e.g. names containing
  // just `..` — already caught by the separator check, but double-check).
  if (!target.startsWith(parentDir)) {
    return { ok: false, error: "Resolved path escapes parent directory" };
  }

  try {
    const existing = await fs.stat(target);
    if (existing.isDirectory()) {
      const entries = await fs.readdir(target);
      if (entries.length > 0) {
        return { ok: false, error: "Folder already exists and is not empty" };
      }
      // Empty dir already exists — acceptable, just open it.
      return { ok: true, path: target };
    }
    return { ok: false, error: "A file with that name already exists" };
  } catch {
    // ENOENT is the happy path — fall through to create.
  }

  try {
    await fs.mkdir(target, { recursive: true });
    return { ok: true, path: target };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
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
