import fs from "node:fs/promises";
import path from "node:path";
import { dialog, BrowserWindow } from "electron";
import {
  WORKSPACE_IGNORE,
  type FileNode,
  type WorkspaceOpenResult,
  type WorkspaceReadFileResult,
  type WorkspaceWriteFileResult,
} from "@idex/types";

/**
 * Workspace service — all path / fs access lives in the main process.
 *
 * We preload the tree to a fixed depth (4) rather than being fully lazy
 * because (a) for typical project roots 4 levels is enough to render
 * meaningful structure without a click, (b) it keeps renderer logic
 * simpler (no IPC chatter on every folder expand), and (c) our ignore
 * set already prunes the heavy hitters (node_modules, dist, .git, …).
 * Beyond depth 4 we intentionally omit `children` — a future refresh
 * call on a narrower root can fetch the missing subtree on demand.
 */
const MAX_DEPTH = 4;
/** Hard cap to stop us from walking truly enormous workspaces. */
const MAX_NODES = 5000;
/** Refuse to read/write files larger than this via the editor. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

async function openPicker(): Promise<WorkspaceOpenResult | null> {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title: "Open Workspace",
        properties: ["openDirectory", "createDirectory"],
      })
    : await dialog.showOpenDialog({
        title: "Open Workspace",
        properties: ["openDirectory", "createDirectory"],
      });

  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  if (!picked) return null;
  return { path: picked };
}

interface WalkState {
  count: number;
}

async function walk(dirPath: string, depth: number, state: WalkState): Promise<FileNode[]> {
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

  const out: FileNode[] = [];
  for (const entry of entries) {
    if (state.count >= MAX_NODES) break;
    if (entry.name.startsWith(".DS_Store")) continue;
    if (WORKSPACE_IGNORE.has(entry.name)) continue;

    const full = path.join(dirPath, entry.name);
    state.count += 1;

    if (entry.isDirectory()) {
      const node: FileNode = { name: entry.name, path: full, kind: "dir" };
      if (depth < MAX_DEPTH) {
        node.children = await walk(full, depth + 1, state);
      }
      out.push(node);
    } else if (entry.isFile()) {
      out.push({ name: entry.name, path: full, kind: "file" });
    }
    // symlinks, fifo, etc. — skip silently
  }
  return out;
}

async function loadTree(rootPath: string): Promise<FileNode | null> {
  try {
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  const state: WalkState = { count: 0 };
  const children = await walk(rootPath, 1, state);
  return {
    name: path.basename(rootPath) || rootPath,
    path: rootPath,
    kind: "dir",
    children,
  };
}

async function readFile(filePath: string): Promise<WorkspaceReadFileResult> {
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

async function writeFile(filePath: string, content: string): Promise<WorkspaceWriteFileResult> {
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

export const workspace = {
  openPicker,
  loadTree,
  readFile,
  writeFile,
};
