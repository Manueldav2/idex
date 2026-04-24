import { create } from "zustand";
import type { SearchOptions, SearchResult } from "@idex/types";
import { ipc } from "@/lib/ipc";
import { useSettings } from "./settings";
import { useWorkspace } from "./workspace";

/**
 * Workspace search store.
 *
 * Keeps the most recent query + flags + result set so the search panel
 * can re-render without losing scroll position when modes flip. Debounces
 * actual ripgrep calls by 200ms so typing fast doesn't fire 12 searches.
 */
interface SearchStore {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  include: string;
  exclude: string;
  result: SearchResult | null;
  loading: boolean;

  setQuery: (q: string) => void;
  setIsRegex: (v: boolean) => void;
  setCaseSensitive: (v: boolean) => void;
  setWholeWord: (v: boolean) => void;
  setInclude: (v: string) => void;
  setExclude: (v: string) => void;
  /** Run the search now (bypasses debounce). */
  runNow: () => Promise<void>;
  /** Clear results + cancel any pending debounce. */
  clear: () => void;
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _reqCounter = 0;

function workspaceRoot(): string | null {
  return (
    useWorkspace.getState().workspacePath ??
    useSettings.getState().config.workspacePath ??
    null
  );
}

export const useSearch = create<SearchStore>((set, get) => ({
  query: "",
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  include: "",
  exclude: "",
  result: null,
  loading: false,

  setQuery(q) {
    set({ query: q });
    schedule(get);
  },
  setIsRegex(v) {
    set({ isRegex: v });
    schedule(get);
  },
  setCaseSensitive(v) {
    set({ caseSensitive: v });
    schedule(get);
  },
  setWholeWord(v) {
    set({ wholeWord: v });
    schedule(get);
  },
  setInclude(v) {
    set({ include: v });
    schedule(get);
  },
  setExclude(v) {
    set({ exclude: v });
    schedule(get);
  },

  async runNow() {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    await runSearch(get);
  },

  clear() {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    set({ result: null, loading: false });
  },
}));

function schedule(get: () => SearchStore) {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  const q = get().query.trim();
  if (q.length < 2) {
    useSearch.setState({ result: null, loading: false });
    return;
  }
  useSearch.setState({ loading: true });
  _debounceTimer = setTimeout(() => {
    void runSearch(get);
  }, 200);
}

async function runSearch(get: () => SearchStore) {
  const root = workspaceRoot();
  if (!root) {
    useSearch.setState({
      loading: false,
      result: {
        ok: false,
        files: [],
        totalMatches: 0,
        truncated: false,
        elapsedMs: 0,
        error: "Open a workspace folder first",
      },
    });
    return;
  }

  const { query, isRegex, caseSensitive, wholeWord, include, exclude } = get();
  const opts: SearchOptions = {
    query: query.trim(),
    isRegex,
    caseSensitive,
    wholeWord,
    include: include.trim() ? include.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    exclude: exclude.trim() ? exclude.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    maxMatches: 5000,
  };

  const myReq = ++_reqCounter;
  try {
    const result = await ipc().search.workspace(root, opts);
    if (myReq !== _reqCounter) return;
    useSearch.setState({ loading: false, result });
  } catch (e) {
    if (myReq !== _reqCounter) return;
    const message = e instanceof Error ? e.message : String(e);
    useSearch.setState({
      loading: false,
      result: {
        ok: false,
        files: [],
        totalMatches: 0,
        truncated: false,
        elapsedMs: 0,
        error: message,
      },
    });
  }
}
