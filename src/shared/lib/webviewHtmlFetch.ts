type Pending = {
  resolve: (html: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chunks?: Map<number, string>;
  chunkCount?: number;
};

/** url = resource to fetch; playerUrl = iframe to mount (defaults to url). */
type Injector = (id: string, url: string, referer: string, playerUrl: string) => void;

const pending = new Map<string, Pending>();
let reqSeq = 0;
let inject: Injector | null = null;

export function registerWebViewHtmlFetcher(fn: Injector | null) {
  inject = fn;
}

export function isWebViewHtmlFetcherReady(): boolean {
  return inject != null;
}

function settleOk(entry: Pending, id: string, html: string) {
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(html);
}

function settleErr(entry: Pending, id: string, error: string) {
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.reject(new Error(error));
}

/** @returns whether a pending fetch was settled by this message */
export function handleWebViewHtmlFetchMessage(raw: string): boolean {
  let msg: {
    type?: string;
    id?: string;
    html?: string;
    error?: string;
    index?: number;
    count?: number;
    data?: string;
    phase?: string;
  };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return false;
  }
  if (!msg.type || !msg.id) return false;

  if (msg.type === 'nd_html_fetch_status') {
    return false;
  }

  if (msg.type === 'nd_html_fetch_chunk') {
    const entry = pending.get(msg.id);
    if (!entry) return false;
    const index = msg.index ?? 0;
    const count = msg.count ?? 0;
    const data = msg.data ?? '';
    if (!entry.chunks) entry.chunks = new Map();
    entry.chunks.set(index, data);
    entry.chunkCount = count;
    if (count > 0 && entry.chunks.size >= count) {
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        parts.push(entry.chunks.get(i) ?? '');
      }
      settleOk(entry, msg.id, parts.join(''));
      return true;
    }
    return false;
  }

  if (msg.type !== 'nd_html_fetch_result') return false;
  const entry = pending.get(msg.id);
  if (!entry) return false;
  if (msg.error) {
    settleErr(entry, msg.id, msg.error);
  } else {
    settleOk(entry, msg.id, msg.html ?? '');
  }
  return true;
}

export type WebViewHtmlFetchOptions = {
  timeoutMs?: number;
  /** Iframe player document for NdStreamHook same-origin/session XHR (embess CDN). */
  playerUrl?: string;
};

/**
 * Fetch text via Chrome WebView / MediaFetchHost — OkHttp often hangs or 403s
 * on embed CDNs.
 */
export function fetchHtmlViaWebView(
  url: string,
  referer: string,
  timeoutMsOrOpts: number | WebViewHtmlFetchOptions = 45000
): Promise<string> {
  if (!inject) {
    return Promise.reject(new Error('WebView HTML fetcher not ready'));
  }
  const opts: WebViewHtmlFetchOptions =
    typeof timeoutMsOrOpts === 'number'
      ? { timeoutMs: timeoutMsOrOpts }
      : timeoutMsOrOpts;
  const timeoutMs = opts.timeoutMs ?? 45000;
  const playerUrl = opts.playerUrl ?? url;
  const id = `html_${++reqSeq}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('WebView HTML fetch timeout'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      inject!(id, url, referer, playerUrl);
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
