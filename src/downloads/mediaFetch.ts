import { create } from 'zustand';

type FetchResult = { status: number; body: string; encoding?: 'base64' };

type Pending = {
  resolve: (value: FetchResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
  chunks?: (string | undefined)[];
  status?: number;
  encoding?: 'base64';
};

type MediaFetchState = {
  playerUrl: string | null;
  ready: boolean;
  /** Bumped to force MediaFetchHost / StreamResolver remount when injector was cleared. */
  generation: number;
  setPlayerUrl: (url: string | null) => void;
  setReady: (ready: boolean) => void;
  bumpGeneration: () => void;
};

const pending = new Map<string, Pending>();
let reqSeq = 0;
let injectFetch:
  | ((id: string, url: string, mode: 'text' | 'bin') => void)
  | null = null;
/** Owner token so sheet unmount does not clear Downloads/host injector. */
let injectorOwner: string | null = null;

export const useMediaFetchStore = create<MediaFetchState>((set) => ({
  playerUrl: null,
  ready: false,
  generation: 0,
  setPlayerUrl: (playerUrl) => set({ playerUrl, ready: false }),
  setReady: (ready) => set({ ready }),
  bumpGeneration: () => set((s) => ({ generation: s.generation + 1, ready: false })),
}));

export function registerMediaFetchInjector(
  fn: ((id: string, url: string, mode: 'text' | 'bin') => void) | null,
  owner = 'default'
) {
  if (fn) {
    injectorOwner = owner;
    injectFetch = fn;
    return;
  }
  // Only the current owner may clear the injector.
  if (injectorOwner === owner || injectorOwner === null) {
    injectFetch = null;
    injectorOwner = null;
  }
}

export function getMediaFetchInjectorOwner(): string | null {
  return injectorOwner;
}

function armTimeout(id: string, entry: Pending) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    pending.delete(id);
    entry.reject(new Error('WebView fetch timeout'));
  }, entry.timeoutMs);
}

export function handleMediaFetchMessage(msg: {
  type?: string;
  id?: string;
  status?: number;
  body?: string;
  encoding?: 'base64';
  error?: string;
  index?: number;
  count?: number;
}) {
  if (msg.type !== 'nd_fetch_result' || !msg.id) return false;
  const entry = pending.get(msg.id);
  if (!entry) return true;

  if (msg.error) {
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.reject(new Error(msg.error));
    return true;
  }

  const count = Math.max(1, msg.count ?? 1);
  const index = msg.index ?? 0;

  if (count === 1) {
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve({
      status: msg.status ?? 0,
      body: msg.body ?? '',
      encoding: msg.encoding,
    });
    return true;
  }

  if (!entry.chunks) {
    entry.chunks = new Array(count);
    entry.status = msg.status ?? 0;
    entry.encoding = msg.encoding;
  }
  if (index >= 0 && index < count) {
    entry.chunks[index] = msg.body ?? '';
  }
  // Keep waiting while chunks arrive (large segments).
  armTimeout(msg.id, entry);

  if (entry.chunks.every((c) => typeof c === 'string')) {
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve({
      status: entry.status ?? msg.status ?? 0,
      body: entry.chunks.join(''),
      encoding: entry.encoding ?? msg.encoding,
    });
  }
  return true;
}

function waitUntilReady(timeoutMs: number, expectedUrl?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      const state = useMediaFetchStore.getState();
      if (!state.ready || !injectFetch) return false;
      if (expectedUrl && state.playerUrl !== expectedUrl) return false;
      return true;
    };
    if (ok()) {
      resolve();
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (ok()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('WebView media fetch not ready'));
      }
    }, 100);
  });
}

function requestFetch(url: string, mode: 'text' | 'bin', timeoutMs: number): Promise<FetchResult> {
  if (!injectFetch) throw new Error('WebView media fetch not ready');
  const id = `f${++reqSeq}`;
  return new Promise<FetchResult>((resolve, reject) => {
    const entry: Pending = {
      resolve,
      reject,
      timer: setTimeout(() => undefined, 0),
      timeoutMs,
    };
    pending.set(id, entry);
    armTimeout(id, entry);
    injectFetch!(id, url, mode);
  });
}

export async function webViewFetchText(url: string, timeoutMs = 45000): Promise<string> {
  await waitUntilReady(20000);
  const result = await requestFetch(url, 'text', timeoutMs);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Failed to fetch playlist: ${result.status}`);
  }
  return result.body;
}

export async function webViewFetchBinary(
  url: string,
  timeoutMs = 120000
): Promise<{ status: number; base64: string }> {
  await waitUntilReady(20000);
  const result = await requestFetch(url, 'bin', timeoutMs);
  return { status: result.status, base64: result.body };
}

export function isMediaFetchReady(forUrl?: string): boolean {
  const state = useMediaFetchStore.getState();
  if (!state.playerUrl || !state.ready || !injectFetch) return false;
  if (forUrl && state.playerUrl !== forUrl) return false;
  return true;
}

/** Mount/reuse the hidden player WebView until CDN fetches are possible. */
export async function ensureMediaFetchPlayer(playerUrl: string): Promise<void> {
  const state = useMediaFetchStore.getState();
  if (state.playerUrl === playerUrl && state.ready && injectFetch) {
    return;
  }
  // Same URL but injector was cleared (sheet unmounted) — force remount.
  if (state.playerUrl === playerUrl && !injectFetch) {
    useMediaFetchStore.getState().bumpGeneration();
    useMediaFetchStore.getState().setPlayerUrl(null);
  }
  useMediaFetchStore.getState().setPlayerUrl(playerUrl);
  await waitUntilReady(45000, playerUrl);
}

export async function withMediaFetchPlayer<T>(
  playerUrl: string,
  task: () => Promise<T>
): Promise<T> {
  if (!isMediaFetchReady(playerUrl)) {
    await ensureMediaFetchPlayer(playerUrl);
  } else {
    await waitUntilReady(45000, playerUrl);
  }
  return await task();
  // Do not clear playerUrl here — Downloads/DownloadSheet hosts own the WebView lifecycle.
}
