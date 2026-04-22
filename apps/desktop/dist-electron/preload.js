"use strict";
const electron = require("electron");
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
const api = {
  config: {
    get: () => electron.ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (patch) => electron.ipcRenderer.invoke(IPC.CONFIG_SET, patch)
  },
  keychain: {
    get: (key) => electron.ipcRenderer.invoke(IPC.KEYCHAIN_GET, key),
    set: (key, value) => electron.ipcRenderer.invoke(IPC.KEYCHAIN_SET, key, value)
  },
  agent: {
    spawn: (opts) => electron.ipcRenderer.invoke(IPC.AGENT_SPAWN, opts),
    input: (input) => electron.ipcRenderer.invoke(IPC.AGENT_INPUT, input),
    resize: (r) => electron.ipcRenderer.invoke(IPC.AGENT_RESIZE, r),
    kill: (sessionId) => electron.ipcRenderer.invoke(IPC.AGENT_KILL, sessionId),
    list: () => electron.ipcRenderer.invoke(IPC.SESSION_LIST),
    onOutput: (cb) => {
      const handler = (_, chunk) => cb(chunk);
      electron.ipcRenderer.on(IPC.AGENT_OUTPUT_STREAM, handler);
      return () => electron.ipcRenderer.off(IPC.AGENT_OUTPUT_STREAM, handler);
    },
    onState: (cb) => {
      const handler = (_, event) => cb(event);
      electron.ipcRenderer.on(IPC.AGENT_STATE, handler);
      return () => electron.ipcRenderer.off(IPC.AGENT_STATE, handler);
    },
    launchExternal: (opts) => electron.ipcRenderer.invoke(IPC.AGENT_LAUNCH_EXTERNAL, opts)
  },
  openExternal: (url) => electron.ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  workspace: {
    open: () => electron.ipcRenderer.invoke(IPC.WORKSPACE_OPEN),
    tree: (rootPath) => electron.ipcRenderer.invoke(IPC.WORKSPACE_TREE, rootPath),
    readFile: (filePath) => electron.ipcRenderer.invoke(IPC.WORKSPACE_READ_FILE, filePath),
    writeFile: (filePath, content) => electron.ipcRenderer.invoke(IPC.WORKSPACE_WRITE_FILE, filePath, content)
  },
  projects: {
    create: (args) => electron.ipcRenderer.invoke(IPC.PROJECTS_CREATE_FOLDER, args)
  }
};
electron.contextBridge.exposeInMainWorld("idex", api);
