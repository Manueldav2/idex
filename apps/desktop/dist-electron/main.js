var D = Object.defineProperty;
var L = (n, e, t) => e in n ? D(n, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[e] = t;
var g = (n, e, t) => L(n, typeof e != "symbol" ? e + "" : e, t);
import { app as h, nativeTheme as F, BrowserWindow as S, ipcMain as c, shell as v } from "electron";
import m from "node:path";
import { fileURLToPath as U } from "node:url";
import { spawn as M } from "node-pty";
import x from "node:os";
import C from "node:fs/promises";
import { existsSync as G, writeFileSync as V, mkdirSync as $ } from "node:fs";
const o = {
  AGENT_SPAWN: "agent:spawn",
  AGENT_INPUT: "agent:input",
  AGENT_OUTPUT_STREAM: "agent:output:stream",
  AGENT_STATE: "agent:state",
  AGENT_KILL: "agent:kill",
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  KEYCHAIN_GET: "keychain:get",
  KEYCHAIN_SET: "keychain:set",
  OPEN_EXTERNAL: "open:external"
}, A = {
  schemaVersion: 1,
  selectedAgent: "claude-code",
  agentBinaryPath: null,
  feedEnabled: !0,
  autoscrollSeconds: 4,
  composioConnectedAccountId: null,
  privacyDisclosureAccepted: !1,
  curatorEnabled: !0,
  adsEnabled: !1
}, w = "com.devvcore.idex", H = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nqry=><]))/g;
function u(n) {
  return n.replace(H, "");
}
const K = /^>\s*$/m, j = /(╭|━){4,}/, Y = {
  id: "claude-code",
  displayName: "Claude Code",
  detect({ rawChunk: n, bufferedSinceLastBoundary: e }) {
    const t = u(n), s = u(e), a = K.test(s) && s.length > 4, i = a || s.length > 16 && j.test(s);
    return {
      userPromptBoundary: a,
      agentDoneBoundary: i,
      cleanText: t
    };
  },
  getCommand() {
    return { cmd: "claude", args: [] };
  }
}, q = /^codex\s*[>›]\s*$/m, J = {
  id: "codex",
  displayName: "Codex",
  detect({ rawChunk: n, bufferedSinceLastBoundary: e }) {
    const t = u(n), s = u(e), a = q.test(s);
    return {
      userPromptBoundary: a,
      agentDoneBoundary: a,
      cleanText: t
    };
  },
  getCommand() {
    return { cmd: "codex", args: [] };
  }
}, X = /^freebuff\s*[→>]\s*$/m, Z = {
  id: "freebuff",
  displayName: "Freebuff",
  detect({ rawChunk: n, bufferedSinceLastBoundary: e }) {
    const t = u(n), s = u(e), a = X.test(s);
    return {
      userPromptBoundary: a,
      agentDoneBoundary: a,
      cleanText: t
    };
  },
  getCommand() {
    return { cmd: "freebuff", args: [] };
  }
}, z = {
  "claude-code": Y,
  codex: J,
  freebuff: Z
};
function I(n) {
  const e = z[n];
  if (!e)
    throw new Error(`Unknown agent id: ${n}`);
  return e;
}
const W = 350;
class Q {
  constructor() {
    g(this, "session", null);
    g(this, "outputCb", null);
    g(this, "stateCb", null);
  }
  async spawn(e, t, s) {
    this.killCurrent(), this.outputCb = t, this.stateCb = s, s("spawning");
    const i = I(e.agentId).getCommand(), E = {
      ...process.env,
      ...e.env ?? {},
      // Force TTY-friendly behavior in agent CLIs
      TERM: process.env.TERM ?? "xterm-256color",
      FORCE_COLOR: "1"
    };
    let l;
    try {
      l = M(i.cmd, i.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd: e.cwd || x.homedir(),
        env: E
      });
    } catch (f) {
      const B = f instanceof Error ? f.message : String(f);
      return s("error"), {
        ok: !1,
        error: `Failed to spawn '${i.cmd}': ${B}. Is it installed and on PATH?`
      };
    }
    return this.session = {
      pty: l,
      agentId: e.agentId,
      buffer: "",
      lastChunkAt: Date.now(),
      idleTimer: null
    }, s("idle"), l.onData((f) => this.handleData(f)), l.onExit(() => {
      s("idle"), this.session = null;
    }), { ok: !0 };
  }
  handleData(e) {
    var i, E, l;
    const t = this.session;
    if (!t) return;
    const s = I(t.agentId);
    t.buffer += e, t.lastChunkAt = Date.now();
    const a = s.detect({
      rawChunk: e,
      bufferedSinceLastBoundary: t.buffer,
      ts: t.lastChunkAt
    });
    (i = this.outputCb) == null || i.call(this, {
      raw: e,
      clean: a.cleanText,
      ts: t.lastChunkAt
    }), a.userPromptBoundary ? (t.buffer = "", (E = this.stateCb) == null || E.call(this, "done"), this.clearIdleTimer()) : (this.armIdleTimer(), (l = this.stateCb) == null || l.call(this, "generating"));
  }
  armIdleTimer() {
    this.clearIdleTimer(), this.session && (this.session.idleTimer = setTimeout(() => {
      var t;
      const e = this.session;
      e && ((t = this.stateCb) == null || t.call(this, "done"), e.buffer = "");
    }, W));
  }
  clearIdleTimer() {
    var e;
    (e = this.session) != null && e.idleTimer && (clearTimeout(this.session.idleTimer), this.session.idleTimer = null);
  }
  write(e) {
    var s;
    if (!this.session) return;
    const t = e.endsWith(`
`) ? e : `${e}\r`;
    this.session.pty.write(t), (s = this.stateCb) == null || s.call(this, "generating");
  }
  killCurrent() {
    var e;
    if (this.session) {
      try {
        this.session.pty.kill();
      } catch {
      }
      this.clearIdleTimer(), this.session = null, (e = this.stateCb) == null || e.call(this, "idle");
    }
  }
  killAll() {
    this.killCurrent();
  }
}
const d = new Q(), _ = m.join(x.homedir(), ".idex"), p = m.join(_, "config.json");
function O() {
  G(_) || $(_, { recursive: !0 });
}
function ee() {
  O(), G(p) || V(p, JSON.stringify(A, null, 2), "utf8");
}
class te {
  async read() {
    ee();
    try {
      const e = await C.readFile(p, "utf8"), t = JSON.parse(e);
      return { ...A, ...t, schemaVersion: 1 };
    } catch (e) {
      return console.error("[config] failed to read; returning defaults", e), A;
    }
  }
  async merge(e) {
    const s = { ...await this.read(), ...e, schemaVersion: 1 };
    return await this.write(s), s;
  }
  async write(e) {
    O(), await C.writeFile(p, JSON.stringify(e, null, 2), "utf8");
  }
}
const N = new te();
let T = null;
const y = /* @__PURE__ */ new Map();
async function b() {
  if (T) return T;
  try {
    const n = await import("keytar");
    return T = n.default ?? n, T;
  } catch (n) {
    return console.warn("[keychain] keytar unavailable, falling back to memory", n), null;
  }
}
const k = {
  async get(n) {
    const e = await b();
    if (!e) return y.get(n) ?? null;
    try {
      return await e.getPassword(w, n);
    } catch (t) {
      return console.error("[keychain] get failed", t), null;
    }
  },
  async set(n, e) {
    const t = await b();
    if (!t)
      return y.set(n, e), !0;
    try {
      return await t.setPassword(w, n, e), !0;
    } catch (s) {
      return console.error("[keychain] set failed", s), y.set(n, e), !1;
    }
  }
}, R = m.dirname(U(import.meta.url)), ne = !!process.env.VITE_DEV_SERVER_URL;
let r = null;
function P() {
  r = new S({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0A0B0E",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    show: !1,
    webPreferences: {
      preload: m.join(R, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      webviewTag: !1
    }
  }), r.once("ready-to-show", () => {
    r == null || r.show();
  }), ne ? (r.loadURL(process.env.VITE_DEV_SERVER_URL), r.webContents.openDevTools({ mode: "detach" })) : r.loadFile(m.join(R, "../dist/index.html")), r.on("closed", () => {
    r = null, d.killAll();
  });
}
function se() {
  c.handle(o.CONFIG_GET, async () => N.read()), c.handle(o.CONFIG_SET, async (n, e) => N.merge(e)), c.handle(o.KEYCHAIN_GET, async (n, e) => k.get(e)), c.handle(o.KEYCHAIN_SET, async (n, e, t) => k.set(e, t)), c.handle(o.AGENT_SPAWN, async (n, e) => d.spawn(e, (t) => {
    r == null || r.webContents.send(o.AGENT_OUTPUT_STREAM, t);
  }, (t) => {
    r == null || r.webContents.send(o.AGENT_STATE, t);
  })), c.handle(o.AGENT_INPUT, async (n, e) => d.write(e.text)), c.handle(o.AGENT_KILL, async () => d.killCurrent()), c.handle(o.OPEN_EXTERNAL, async (n, e) => !e || typeof e != "string" || !/^https?:\/\//i.test(e) ? !1 : (await v.openExternal(e), !0));
}
h.whenReady().then(() => {
  F.themeSource = "dark", se(), P(), h.on("activate", () => {
    S.getAllWindows().length === 0 && P();
  });
});
h.on("window-all-closed", () => {
  d.killAll(), process.platform !== "darwin" && h.quit();
});
h.on("before-quit", () => {
  d.killAll();
});
