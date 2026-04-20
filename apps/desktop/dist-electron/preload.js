import { contextBridge as N, ipcRenderer as n } from "electron";
const T = {
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
}, _ = {
  config: {
    get: () => n.invoke(T.CONFIG_GET),
    set: (e) => n.invoke(T.CONFIG_SET, e)
  },
  keychain: {
    get: (e) => n.invoke(T.KEYCHAIN_GET, e),
    set: (e, E) => n.invoke(T.KEYCHAIN_SET, e, E)
  },
  agent: {
    spawn: (e) => n.invoke(T.AGENT_SPAWN, e),
    input: (e) => n.invoke(T.AGENT_INPUT, e),
    kill: () => n.invoke(T.AGENT_KILL),
    onOutput: (e) => {
      const E = (o, t) => e(t);
      return n.on(T.AGENT_OUTPUT_STREAM, E), () => n.off(T.AGENT_OUTPUT_STREAM, E);
    },
    onState: (e) => {
      const E = (o, t) => e(t);
      return n.on(T.AGENT_STATE, E), () => n.off(T.AGENT_STATE, E);
    }
  },
  openExternal: (e) => n.invoke(T.OPEN_EXTERNAL, e)
};
N.exposeInMainWorld("idex", _);
