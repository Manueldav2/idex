"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const node_url = require("node:url");
const nodePty = require("node-pty");
const os = require("node:os");
const node_crypto = require("node:crypto");
const node_fs = require("node:fs");
const node_child_process = require("node:child_process");
const node_util = require("node:util");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const IPC = {
  AGENT_SPAWN: "agent:spawn",
  AGENT_INPUT: "agent:input",
  AGENT_OUTPUT_STREAM: "agent:output:stream",
  AGENT_STATE: "agent:state",
  AGENT_KILL: "agent:kill",
  AGENT_RESIZE: "agent:resize",
  /**
   * Launch the agent CLI in the user's native Terminal.app instead of
   * embedding a PTY. The native terminal renders Claude Code with
   * Apple's text engine — perfect glyphs, no xterm font fights — at
   * the cost of being a separate window. IDEX itself stays a feed +
   * chrome shell.
   */
  AGENT_LAUNCH_EXTERNAL: "agent:launch-external",
  SESSION_LIST: "session:list",
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  KEYCHAIN_GET: "keychain:get",
  KEYCHAIN_SET: "keychain:set",
  OPEN_EXTERNAL: "open:external",
  WORKSPACE_OPEN: "workspace:open",
  WORKSPACE_TREE: "workspace:tree",
  WORKSPACE_READ_FILE: "workspace:read-file",
  WORKSPACE_WRITE_FILE: "workspace:write-file",
  PROJECTS_CREATE_FOLDER: "projects:create-folder"
};
const DEFAULT_APP_CONFIG = {
  schemaVersion: 1,
  selectedAgent: "claude-code",
  agentBinaryPath: null,
  feedEnabled: true,
  autoscrollSeconds: 4,
  composioConnectedAccountId: null,
  privacyDisclosureAccepted: false,
  curatorEnabled: true,
  adsEnabled: false,
  mode: "agent",
  workspacePath: null,
  hasSeenShortcutHint: false,
  recentProjects: []
};
const WORKSPACE_IGNORE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "release",
  ".turbo",
  "coverage"
]);
const KEYCHAIN_SERVICE = "com.devvcore.idex";
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nqry=><]))/g;
function stripAnsi(input) {
  return input.replace(ANSI_REGEX, "");
}
const PROMPT_LINE_RE = /^>\s*$/m;
const ASSISTANT_BANNER_RE = /(╭|━){4,}/;
const claudeCodeAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  detect({ rawChunk, bufferedSinceLastBoundary }) {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);
    const userPromptBoundary = PROMPT_LINE_RE.test(cleanBuffer) && cleanBuffer.length > 4;
    const agentDoneBoundary = userPromptBoundary || cleanBuffer.length > 16 && ASSISTANT_BANNER_RE.test(cleanBuffer);
    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk
    };
  },
  getCommand() {
    return { cmd: "claude", args: [] };
  }
};
const PROMPT_CHEVRON_RE = /(?:^|\n) {0,2}›(?=\s|$)|›(?=[A-Za-z])/;
const STREAMING_HINT_RE = /esc\s+to\s+interrupt/gi;
function lastIndexOf$1(re, s) {
  re.lastIndex = 0;
  let match;
  let last = -1;
  while ((match = re.exec(s)) !== null) {
    last = match.index;
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return last;
}
const codexAdapter = {
  id: "codex",
  displayName: "Codex",
  detect({
    rawChunk,
    bufferedSinceLastBoundary
  }) {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);
    const streamingAt = lastIndexOf$1(STREAMING_HINT_RE, cleanBuffer);
    const footerMatch = cleanBuffer.match(
      /\s·\s\d{1,3}% left\s·\s[^\n]*/g
    );
    const footerAt = footerMatch ? cleanBuffer.lastIndexOf(footerMatch[footerMatch.length - 1]) : -1;
    const chevronHit = PROMPT_CHEVRON_RE.test(cleanBuffer);
    const idleSignalAt = Math.max(footerAt, chevronHit ? 0 : -1);
    const stillGenerating = streamingAt > idleSignalAt && streamingAt !== -1;
    const longEnough = cleanBuffer.length > 24;
    const userPromptBoundary = !stillGenerating && (footerAt >= 0 || chevronHit) && longEnough;
    const agentDoneBoundary = userPromptBoundary;
    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk
    };
  },
  // Confirmed via `npm view @openai/codex bin` → `{ codex: 'bin/codex.js' }`.
  getCommand() {
    return { cmd: "codex", args: [] };
  }
};
function lastIndexOf(re, s) {
  re.lastIndex = 0;
  let match;
  let last = -1;
  while ((match = re.exec(s)) !== null) {
    last = match.index;
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return last;
}
const STREAMING_HINT_GRE = /(thinking\.\.\.|working\.\.\.|retrying\.\.\.|connecting\.\.\.)/gi;
const DEFAULT_PLACEHOLDER_GRE = /enter a coding task or \/ for commands/gi;
const IDLE_STATUS_GRE = /Free session\s*·/gi;
const freebuffAdapter = {
  id: "freebuff",
  displayName: "Freebuff",
  detect({
    rawChunk,
    bufferedSinceLastBoundary
  }) {
    const cleanChunk = stripAnsi(rawChunk);
    const cleanBuffer = stripAnsi(bufferedSinceLastBoundary);
    const streamingAt = lastIndexOf(STREAMING_HINT_GRE, cleanBuffer);
    const placeholderAt = lastIndexOf(DEFAULT_PLACEHOLDER_GRE, cleanBuffer);
    const idleStatusAt = lastIndexOf(IDLE_STATUS_GRE, cleanBuffer);
    const idleAt = Math.max(placeholderAt, idleStatusAt);
    const stillGenerating = streamingAt > idleAt && streamingAt !== -1;
    const longEnough = cleanBuffer.length > 32;
    const userPromptBoundary = !stillGenerating && idleAt >= 0 && longEnough;
    const agentDoneBoundary = userPromptBoundary;
    return {
      userPromptBoundary,
      agentDoneBoundary,
      cleanText: cleanChunk
    };
  },
  // Confirmed via `npm view freebuff bin` → `{ freebuff: 'index.js' }`.
  getCommand() {
    return { cmd: "freebuff", args: [] };
  }
};
const SHELL_FALLBACK = "/bin/zsh";
const shellAdapter = {
  id: "shell",
  displayName: "Shell",
  detect({ rawChunk }) {
    return {
      userPromptBoundary: false,
      agentDoneBoundary: false,
      cleanText: stripAnsi(rawChunk)
    };
  },
  /**
   * Run the user's actual login shell. We prefer $SHELL so the terminal
   * honors zsh/bash/fish/nushell preferences, but fall back to zsh (the
   * default on macOS 10.15+). `-l` makes it a login shell so ~/.zprofile
   * and friends run — which is what the user expects when they open a
   * terminal inside an IDE.
   *
   * The adapter is shared between main and renderer; the renderer never
   * has process.env, so we look it up via globalThis and fall back
   * cleanly. getCommand() is in practice only called from main (where
   * process.env is fine), but this keeps the types honest in either
   * environment.
   */
  getCommand() {
    var _a;
    const env = (_a = globalThis.process) == null ? void 0 : _a.env;
    const shellPath = (env == null ? void 0 : env["SHELL"]) || SHELL_FALLBACK;
    return { cmd: shellPath, args: ["-l"] };
  }
};
const ADAPTERS = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  freebuff: freebuffAdapter,
  shell: shellAdapter
};
function getAdapter(id) {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new Error(`Unknown agent id: ${id}`);
  }
  return adapter;
}
const IDLE_BOUNDARY_MS = 350;
class AgentHost {
  constructor() {
    __publicField(this, "sessions", /* @__PURE__ */ new Map());
    __publicField(this, "cbs", null);
  }
  setCallbacks(cbs) {
    this.cbs = cbs;
  }
  async spawn(opts) {
    const sessionId = opts.sessionId ?? node_crypto.randomUUID();
    const adapter = getAdapter(opts.agentId);
    const command = adapter.getCommand();
    const env = {
      ...process.env,
      ...opts.env ?? {},
      TERM: process.env["TERM"] ?? "xterm-256color",
      FORCE_COLOR: "1"
    };
    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      `${os.homedir()}/.volta/bin`,
      `${os.homedir()}/.bun/bin`,
      `${os.homedir()}/.pnpm/bin`
    ];
    const fs2 = await import("node:fs");
    const nvmRoot = `${os.homedir()}/.nvm/versions/node`;
    try {
      if (fs2.existsSync(nvmRoot)) {
        for (const v of fs2.readdirSync(nvmRoot)) extraPaths.push(`${nvmRoot}/${v}/bin`);
      }
    } catch {
    }
    env["PATH"] = [...extraPaths, env["PATH"] ?? ""].filter(Boolean).join(":");
    const cwd = opts.cwd || os.homedir();
    const label = opts.label ?? `${adapter.displayName} · ${cwd.replace(os.homedir(), "~").split("/").slice(-2).join("/") || "~"}`;
    console.log(`[idex] spawn session=${sessionId} agent=${opts.agentId} cwd=${cwd}`);
    let pty;
    try {
      pty = nodePty.spawn(command.cmd, command.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd,
        env
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[idex] spawn failed: ${msg}`);
      return {
        ok: false,
        error: `Failed to spawn '${command.cmd}': ${msg}. Is it installed and on PATH?`
      };
    }
    const session = {
      id: sessionId,
      pty,
      agentId: opts.agentId,
      cwd,
      label,
      createdAt: Date.now(),
      buffer: "",
      lastChunkAt: Date.now(),
      idleTimer: null,
      lastEmittedState: null,
      state: "idle"
    };
    this.sessions.set(sessionId, session);
    this.emitState(sessionId, "idle");
    pty.onData((data) => this.handleData(sessionId, data));
    pty.onExit(() => {
      var _a;
      console.log(`[idex] session ${sessionId} exited`);
      this.sessions.delete(sessionId);
      (_a = this.cbs) == null ? void 0 : _a.onState({ sessionId, state: "idle" });
    });
    return {
      ok: true,
      session: {
        id: sessionId,
        agentId: opts.agentId,
        cwd,
        label,
        state: "idle",
        createdAt: session.createdAt
      }
    };
  }
  handleData(sessionId, raw) {
    var _a;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const adapter = getAdapter(session.agentId);
    session.buffer += raw;
    session.lastChunkAt = Date.now();
    const detection = adapter.detect({
      rawChunk: raw,
      bufferedSinceLastBoundary: session.buffer,
      ts: session.lastChunkAt
    });
    (_a = this.cbs) == null ? void 0 : _a.onOutput({
      sessionId,
      raw,
      clean: detection.cleanText,
      ts: session.lastChunkAt
    });
    if (detection.userPromptBoundary) {
      session.buffer = "";
      this.emitState(sessionId, "done");
      this.clearIdleTimer(session);
    } else {
      this.armIdleTimer(session);
      this.emitState(sessionId, "generating");
    }
  }
  emitState(sessionId, next) {
    var _a;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.lastEmittedState === next) return;
    session.lastEmittedState = next;
    session.state = next;
    (_a = this.cbs) == null ? void 0 : _a.onState({ sessionId, state: next });
  }
  armIdleTimer(session) {
    this.clearIdleTimer(session);
    session.idleTimer = setTimeout(() => {
      if (!this.sessions.has(session.id)) return;
      this.emitState(session.id, "done");
      session.buffer = "";
    }, IDLE_BOUNDARY_MS);
  }
  clearIdleTimer(session) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }
  write(sessionId, text) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.write(text);
  }
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.resize(cols, rows);
    } catch {
    }
  }
  kill(sessionId) {
    var _a;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.kill();
    } catch {
    }
    this.clearIdleTimer(session);
    this.sessions.delete(sessionId);
    (_a = this.cbs) == null ? void 0 : _a.onState({ sessionId, state: "idle" });
  }
  list() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      agentId: s.agentId,
      cwd: s.cwd,
      label: s.label,
      state: s.state,
      createdAt: s.createdAt
    }));
  }
  killAll() {
    for (const id of Array.from(this.sessions.keys())) {
      this.kill(id);
    }
  }
}
const agentHost = new AgentHost();
const CONFIG_DIR = path.join(os.homedir(), ".idex");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
function ensureDir() {
  if (!node_fs.existsSync(CONFIG_DIR)) {
    node_fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
function ensureFile() {
  ensureDir();
  if (!node_fs.existsSync(CONFIG_FILE)) {
    node_fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_APP_CONFIG, null, 2), "utf8");
  }
}
class ConfigStore {
  async read() {
    ensureFile();
    try {
      const raw = await fs.readFile(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APP_CONFIG, ...parsed, schemaVersion: 1 };
    } catch (e) {
      console.error("[config] failed to read; returning defaults", e);
      return DEFAULT_APP_CONFIG;
    }
  }
  async merge(patch) {
    const current = await this.read();
    const next = { ...current, ...patch, schemaVersion: 1 };
    await this.write(next);
    return next;
  }
  async write(config) {
    ensureDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  }
}
const configStore = new ConfigStore();
let keytar = null;
const memoryFallback = /* @__PURE__ */ new Map();
async function loadKeytar() {
  if (keytar) return keytar;
  try {
    const mod = await import("keytar");
    keytar = mod.default ?? mod;
    return keytar;
  } catch (e) {
    console.warn("[keychain] keytar unavailable, falling back to memory", e);
    return null;
  }
}
const keychain = {
  async get(key) {
    const k = await loadKeytar();
    if (!k) return memoryFallback.get(key) ?? null;
    try {
      return await k.getPassword(KEYCHAIN_SERVICE, key);
    } catch (e) {
      console.error("[keychain] get failed", e);
      return null;
    }
  },
  async set(key, value) {
    const k = await loadKeytar();
    if (!k) {
      memoryFallback.set(key, value);
      return true;
    }
    try {
      await k.setPassword(KEYCHAIN_SERVICE, key, value);
      return true;
    } catch (e) {
      console.error("[keychain] set failed", e);
      memoryFallback.set(key, value);
      return false;
    }
  }
};
const MAX_DEPTH = 4;
const MAX_NODES = 5e3;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
async function openPicker() {
  const parent = electron.BrowserWindow.getFocusedWindow() ?? electron.BrowserWindow.getAllWindows()[0] ?? null;
  const result = parent ? await electron.dialog.showOpenDialog(parent, {
    title: "Open Workspace",
    properties: ["openDirectory", "createDirectory"]
  }) : await electron.dialog.showOpenDialog({
    title: "Open Workspace",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  if (!picked) return null;
  return { path: picked };
}
async function walk(dirPath, depth, state) {
  if (state.count >= MAX_NODES) return [];
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (e) {
    console.warn("[workspace] readdir failed", dirPath, e);
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const out = [];
  for (const entry of entries) {
    if (state.count >= MAX_NODES) break;
    if (entry.name.startsWith(".DS_Store")) continue;
    if (WORKSPACE_IGNORE.has(entry.name)) continue;
    const full = path.join(dirPath, entry.name);
    state.count += 1;
    if (entry.isDirectory()) {
      const node = { name: entry.name, path: full, kind: "dir" };
      if (depth < MAX_DEPTH) {
        node.children = await walk(full, depth + 1, state);
      }
      out.push(node);
    } else if (entry.isFile()) {
      out.push({ name: entry.name, path: full, kind: "file" });
    }
  }
  return out;
}
async function loadTree(rootPath) {
  try {
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  const state = { count: 0 };
  const children = await walk(rootPath, 1, state);
  return {
    name: path.basename(rootPath) || rootPath,
    path: rootPath,
    kind: "dir",
    children
  };
}
async function readFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid path" };
  }
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return { ok: false, error: "Not a file" };
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, error: `File too large (${stat.size} bytes)` };
    }
    const content = await fs.readFile(filePath, "utf8");
    return { ok: true, content };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
async function writeFile(filePath, content) {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid path" };
  }
  if (typeof content !== "string") {
    return { ok: false, error: "Content must be a string" };
  }
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return { ok: false, error: "Content too large" };
  }
  try {
    await fs.writeFile(filePath, content, "utf8");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
const workspace = {
  openPicker,
  loadTree,
  readFile,
  writeFile
};
const execAsync = node_util.promisify(node_child_process.exec);
function commandFor(agentId) {
  switch (agentId) {
    case "claude-code":
      return "exec claude";
    case "codex":
      return "exec codex";
    case "freebuff":
      return "exec freebuff";
    case "shell":
    default:
      return "exec $SHELL -l";
  }
}
function escapeForApplescript(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
async function launchExternalAgent(opts) {
  var _a;
  const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : os.homedir();
  const command = commandFor(opts.agentId);
  const extraPaths = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${os.homedir()}/.volta/bin`,
    `${os.homedir()}/.bun/bin`,
    `${os.homedir()}/.pnpm/bin`
  ];
  try {
    const fs2 = await import("node:fs");
    const nvm = `${os.homedir()}/.nvm/versions/node`;
    if (fs2.existsSync(nvm)) {
      for (const v of fs2.readdirSync(nvm)) extraPaths.push(`${nvm}/${v}/bin`);
    }
  } catch {
  }
  const exportPath = `export PATH="${extraPaths.join(":")}:$PATH"`;
  const cdLine = `cd "${escapeForApplescript(cwd)}"`;
  const initialPrompt = (_a = opts.initialPrompt) == null ? void 0 : _a.trim();
  const promptLine = initialPrompt ? ` && printf %s ${shellQuote(initialPrompt)}` : "";
  const fullCmd = `${exportPath} && ${cdLine} && ${command}${promptLine}`;
  const script = `tell application "Terminal"
  activate
  set newTab to do script "${escapeForApplescript(fullCmd)}"
  set windowId to id of (window 1 whose tabs contains newTab)
  return windowId
end tell`;
  try {
    const { stdout } = await execAsync(`osascript -e '${escapeForOsascriptArg(script)}'`);
    const windowId = Number(stdout.trim());
    const label = friendlyLabel(opts.agentId, cwd);
    return {
      ok: true,
      windowId: Number.isFinite(windowId) ? windowId : void 0,
      label
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function escapeForOsascriptArg(s) {
  return s.replace(/'/g, `'\\''`);
}
function friendlyLabel(agentId, cwd) {
  const shortCwd = cwd.replace(os.homedir(), "~").split("/").filter(Boolean).slice(-2).join("/") || "~";
  const display = {
    "claude-code": "Claude Code",
    codex: "Codex",
    freebuff: "Freebuff",
    shell: "Shell"
  }[agentId] ?? agentId;
  return `${display} · ${shortCwd}`;
}
const __dirname$1 = path.dirname(node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
const isDev = !!process.env["VITE_DEV_SERVER_URL"];
let mainWindow = null;
function createMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0A0B0E",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow == null ? void 0 : mainWindow.show());
  if (isDev) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
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
    onOutput: (chunk) => mainWindow == null ? void 0 : mainWindow.webContents.send(IPC.AGENT_OUTPUT_STREAM, chunk),
    onState: (event) => mainWindow == null ? void 0 : mainWindow.webContents.send(IPC.AGENT_STATE, event)
  });
  electron.ipcMain.handle(IPC.CONFIG_GET, async () => configStore.read());
  electron.ipcMain.handle(IPC.CONFIG_SET, async (_, patch) => configStore.merge(patch));
  electron.ipcMain.handle(IPC.KEYCHAIN_GET, async (_, key) => keychain.get(key));
  electron.ipcMain.handle(IPC.KEYCHAIN_SET, async (_, key, value) => keychain.set(key, value));
  electron.ipcMain.handle(IPC.AGENT_SPAWN, async (_, opts) => agentHost.spawn(opts));
  electron.ipcMain.handle(IPC.AGENT_INPUT, async (_, input) => {
    agentHost.write(input.sessionId, input.text);
  });
  electron.ipcMain.handle(IPC.AGENT_RESIZE, async (_, r) => {
    agentHost.resize(r.sessionId, r.cols, r.rows);
  });
  electron.ipcMain.handle(IPC.AGENT_KILL, async (_, sessionId) => agentHost.kill(sessionId));
  electron.ipcMain.handle(IPC.SESSION_LIST, async () => agentHost.list());
  electron.ipcMain.handle(
    IPC.AGENT_LAUNCH_EXTERNAL,
    async (_, opts) => launchExternalAgent(opts)
  );
  electron.ipcMain.handle(IPC.OPEN_EXTERNAL, async (_, url) => {
    if (!url || typeof url !== "string") return false;
    if (!/^https?:\/\//i.test(url)) return false;
    await electron.shell.openExternal(url);
    return true;
  });
  electron.ipcMain.handle(IPC.WORKSPACE_OPEN, async () => workspace.openPicker());
  electron.ipcMain.handle(IPC.WORKSPACE_TREE, async (_, rootPath) => workspace.loadTree(rootPath));
  electron.ipcMain.handle(IPC.WORKSPACE_READ_FILE, async (_, filePath) => workspace.readFile(filePath));
  electron.ipcMain.handle(
    IPC.WORKSPACE_WRITE_FILE,
    async (_, filePath, content) => workspace.writeFile(filePath, content)
  );
  electron.ipcMain.handle(
    IPC.PROJECTS_CREATE_FOLDER,
    async (_, args) => createProjectFolder(args)
  );
}
async function createProjectFolder(args) {
  const parentDir = args == null ? void 0 : args.parentDir;
  const name = args == null ? void 0 : args.name;
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
      return { ok: true, path: target };
    }
    return { ok: false, error: "A file with that name already exists" };
  } catch {
  }
  try {
    await fs.mkdir(target, { recursive: true });
    return { ok: true, path: target };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
electron.app.whenReady().then(() => {
  electron.nativeTheme.themeSource = "dark";
  registerIpc();
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
electron.app.on("window-all-closed", () => {
  agentHost.killAll();
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => agentHost.killAll());
