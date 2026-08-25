import {
  fetchHtmlViaWebView,
  isWebViewHtmlFetcherReady,
} from '@/src/shared/lib/webviewHtmlFetch';
import type { CaptionTrack, HlsSource, StreamPayload, StreamQualityMap } from './types';
import { BASE_URL } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** VenomPlayer mirrors used as download embeds (same makePlayer / playlist JSON). */
function venomHostRank(url: string): number {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'embess.ws' || host.endsWith('.embess.ws')) return 0;
    if (host === 'namy.ws' || host.endsWith('.namy.ws')) return 1;
    if (host === 'domem.ws' || host.endsWith('.domem.ws')) return 2;
  } catch {
    if (/embess\.ws/i.test(url)) return 0;
    if (/namy\.ws/i.test(url)) return 1;
    if (/domem\.ws/i.test(url)) return 2;
  }
  return 99;
}

export function isVenomEmbedUrl(url: string): boolean {
  return venomHostRank(url) < 99;
}

/** Alias: Venom embeds including namy/domem mirrors. */
export function isEmbessPlayerUrl(url: string): boolean {
  return isVenomEmbedUrl(url);
}

/** Prefer embess, then namy, then domem when several Venom iframes exist. */
export function pickVenomEmbedUrl(urls: string[]): string | undefined {
  const hits = urls.filter((u) => isVenomEmbedUrl(u));
  if (!hits.length) return undefined;
  hits.sort((a, b) => venomHostRank(a) - venomHostRank(b));
  return hits[0];
}

export function isFsstPlayerUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('fsst.online') || host.includes('incvideo');
  } catch {
    return /fsst\.online|incvideo/i.test(url);
  }
}

/** True when playerUrl can be resolved without bnsi StreamResolver. */
export function isResolvableEmbedUrl(url: string): boolean {
  return isEmbessPlayerUrl(url) || isFsstPlayerUrl(url);
}

/**
 * fsst.online 301s to incvideo1.online. On some Xiaomi OkHttp stacks the
 * fsst host hangs forever while the canonical CDN host responds quickly —
 * always fetch HTML from the redirect target.
 */
export function canonicalizeEmbedFetchUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'fsst.online' || host === 'www.fsst.online') {
      u.hostname = 'incvideo1.online';
      return u.toString();
    }
  } catch {
    return url.replace(/^(https?:\/\/)(?:www\.)?fsst\.online/i, '$1incvideo1.online');
  }
  return url;
}

type EmbessAudioMeta = {
  names: string[];
  order: number[];
};

type EmbessCc = { url: string; name: string };

export type EmbessSource = {
  hls: string;
  audio: EmbessAudioMeta;
  cc: EmbessCc[];
};

function extractBalanced(
  source: string,
  openIndex: number,
  openCh: '{' | '[',
  closeCh: '}' | ']'
): string | null {
  if (source[openIndex] !== openCh) return null;
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let escaped = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

/**
 * Extract balanced `{...}` starting at `openBraceIndex` (must point at `{`).
 * Handles nested braces and string literals with escapes.
 */
export function extractBalancedObject(source: string, openBraceIndex: number): string | null {
  return extractBalanced(source, openBraceIndex, '{', '}');
}

/** Extract balanced `[...]` starting at `openBracketIndex` (must point at `[`). */
export function extractBalancedArray(source: string, openBracketIndex: number): string | null {
  return extractBalanced(source, openBracketIndex, '[', ']');
}

function parseJsStringArray(raw: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const lit = m[1] !== undefined ? m[1] : m[2] || '';
    out.push(lit.replace(/\\(.)/g, '$1'));
  }
  return out;
}

function parseJsNumberArray(raw: string): number[] {
  return [...raw.matchAll(/-?\d+/g)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n));
}

/**
 * Parse embess `makePlayer({ ... source: { hls, audio, cc } ...})` from embed HTML.
 */
export function parseEmbessSource(html: string): EmbessSource | null {
  // Prefer the call site `makePlayer({...})` — the page also defines
  // `function makePlayer(opts)` which must not win the search.
  const callMatch = html.match(/makePlayer\s*\(\s*\{/i);
  const makeIdx = callMatch?.index ?? html.search(/makePlayer\s*\(/i);
  if (makeIdx < 0) return null;
  const braceIdx = html.indexOf('{', makeIdx);
  if (braceIdx < 0) return null;
  const optsLiteral = extractBalancedObject(html, braceIdx);
  if (!optsLiteral) return null;

  const sourceKey = optsLiteral.search(/\bsource\s*:/);
  if (sourceKey < 0) return null;
  const sourceBrace = optsLiteral.indexOf('{', sourceKey);
  if (sourceBrace < 0) return null;
  // Parent optsLiteral is brace-balanced, so the object at sourceBrace always closes.
  const sourceLiteral = extractBalancedObject(optsLiteral, sourceBrace)!;

  const hlsMatch = sourceLiteral.match(/\bhls\s*:\s*["']([^"']+)["']/i);
  if (!hlsMatch?.[1]) return null;
  const hls = hlsMatch[1].trim();
  if (!hls) return null;

  let names: string[] = [];
  let order: number[] = [];
  const audioKey = sourceLiteral.search(/\baudio\s*:/);
  if (audioKey >= 0) {
    const audioBrace = sourceLiteral.indexOf('{', audioKey);
    if (audioBrace >= 0) {
      const audioLiteral = extractBalancedObject(sourceLiteral, audioBrace)!;
      const namesMatch = audioLiteral.match(/["']?names["']?\s*:\s*(\[[\s\S]*?\])/i);
      const orderMatch = audioLiteral.match(/["']?order["']?\s*:\s*(\[[\s\S]*?\])/i);
      if (namesMatch?.[1]) names = parseJsStringArray(namesMatch[1]);
      if (orderMatch?.[1]) order = parseJsNumberArray(orderMatch[1]);
    }
  }
  if (!order.length) order = names.map((_, i) => i);

  const cc: EmbessCc[] = [];
  const ccKey = sourceLiteral.search(/\bcc\s*:/);
  if (ccKey >= 0) {
    const ccBracket = sourceLiteral.indexOf('[', ccKey);
    if (ccBracket >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = ccBracket; i < sourceLiteral.length; i++) {
        const ch = sourceLiteral[i];
        if (ch === '[') depth += 1;
        else if (ch === ']') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > ccBracket) {
        const ccLiteral = sourceLiteral.slice(ccBracket, end + 1);
        const entryRe =
          /\{\s*["']?url["']?\s*:\s*["']([^"']+)["']\s*,\s*["']?name["']?\s*:\s*["']([^"']*)["']\s*\}/gi;
        let em: RegExpExecArray | null;
        while ((em = entryRe.exec(ccLiteral))) {
          cc.push({ url: em[1], name: em[2] });
        }
        if (!cc.length) {
          const altRe =
            /\{\s*["']?name["']?\s*:\s*["']([^"']*)["']\s*,\s*["']?url["']?\s*:\s*["']([^"']+)["']\s*\}/gi;
          while ((em = altRe.exec(ccLiteral))) {
            cc.push({ url: em[2], name: em[1] });
          }
        }
      }
    }
  }

  return { hls, audio: { names, order }, cc };
}

export type EmbessPlaylistEpisode = {
  season: number;
  episode: number;
  source: EmbessSource;
};

type EmbessPlaylistCcJson = { url?: string; name?: string };
type EmbessPlaylistEpisodeJson = {
  episode?: string | number;
  hls?: string;
  audio?: { names?: string[]; order?: number[] };
  cc?: EmbessPlaylistCcJson[];
};
type EmbessPlaylistSeasonJson = {
  season?: number;
  episodes?: EmbessPlaylistEpisodeJson[];
};

/**
 * VenomPlayer serial playlist: `makePlayer({ playlist: { seasons: [{ season, episodes }] } })`.
 */
export function parseEmbessPlaylistEpisodes(html: string): EmbessPlaylistEpisode[] {
  const seasonsKey = html.search(/seasons\s*:\s*\[/);
  if (seasonsKey < 0) return [];
  const bracket = html.indexOf('[', seasonsKey);
  const literal = extractBalancedArray(html, bracket);
  if (!literal) return [];
  let seasons: EmbessPlaylistSeasonJson[];
  try {
    seasons = JSON.parse(literal) as EmbessPlaylistSeasonJson[];
  } catch {
    return [];
  }
  /* istanbul ignore next -- JSON.parse of a [...] literal is always an array */
  if (!Array.isArray(seasons)) return [];

  const out: EmbessPlaylistEpisode[] = [];
  for (const seasonBlock of seasons) {
    const season = Number(seasonBlock?.season);
    if (!Number.isFinite(season) || season <= 0) continue;
    const episodes = seasonBlock.episodes;
    if (!Array.isArray(episodes)) continue;
    for (const ep of episodes) {
      const hls = typeof ep?.hls === 'string' ? ep.hls.trim() : '';
      if (!hls) continue;
      const episode = Number(ep.episode);
      if (!Number.isFinite(episode)) continue;
      if (episode <= 0) continue;
      const names = Array.isArray(ep.audio?.names)
        ? ep.audio.names.filter((n): n is string => typeof n === 'string')
        : [];
      const order = Array.isArray(ep.audio?.order)
        ? ep.audio.order.filter((n): n is number => Number.isFinite(n))
        : names.map((_, i) => i);
      const cc: EmbessCc[] = [];
      if (Array.isArray(ep.cc)) {
        for (const cap of ep.cc) {
          if (cap?.url) cc.push({ url: cap.url, name: cap.name ?? '' });
        }
      }
      out.push({
        season,
        episode,
        source: {
          hls,
          audio: { names, order: order.length ? order : names.map((_, i) => i) },
          cc,
        },
      });
    }
  }
  return out;
}

export function pickEmbessPlaylistEpisode(
  episodes: EmbessPlaylistEpisode[],
  season?: number,
  episode?: number
): EmbessPlaylistEpisode | undefined {
  if (!episodes.length) return undefined;
  if (season != null && episode != null) {
    const hit = episodes.find((e) => e.season === season && e.episode === episode);
    if (hit) return hit;
  }
  return episodes[0];
}

export type MasterAudioTrack = {
  name: string;
  uri: string;
  groupId: string;
};

export type MasterVideoVariant = {
  width: number;
  height: number;
  bandwidth: number;
  uri: string;
  audioGroup: string;
};

/** Bucket letterboxed heights into common download quality labels. */
export function bucketQualityLabel(width: number, height: number): string {
  if (width >= 1920 || height >= 1080) return '1080';
  if (width >= 1280 || height >= 700) return '720';
  if (width >= 854 || height >= 480) return '480';
  if (width >= 640 || height >= 360) return '360';
  return String(height > 0 ? height : 240);
}

export function parseMasterPlaylist(masterText: string, masterUrl: string): {
  audioTracks: MasterAudioTrack[];
  variants: MasterVideoVariant[];
} {
  const lines = masterText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const audioTracks: MasterAudioTrack[] = [];
  const variants: MasterVideoVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#EXT-X-MEDIA:/i.test(line) && /TYPE=AUDIO/i.test(line)) {
      const groupId = line.match(/GROUP-ID="([^"]+)"/i)?.[1] ?? '';
      const name = line.match(/NAME="([^"]+)"/i)?.[1] ?? '';
      const uriRaw = line.match(/URI="([^"]+)"/i)?.[1];
      if (!uriRaw || !name) continue;
      // Prefer primary group; skip failover mirrors for audioId mapping.
      if (/failover/i.test(groupId)) continue;
      let uri = uriRaw;
      try {
        uri = new URL(uriRaw, masterUrl).href;
      } catch {
        // keep raw
      }
      audioTracks.push({ name, uri, groupId });
      continue;
    }
    if (!/^#EXT-X-STREAM-INF:/i.test(line)) continue;
    const next = lines[i + 1];
    if (!next || next.startsWith('#')) continue;
    const audioGroup = line.match(/AUDIO="([^"]+)"/i)?.[1] ?? '';
    if (/failover/i.test(audioGroup)) continue;
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const width = res ? Number(res[1]) : 0;
    const height = res ? Number(res[2]) : 0;
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] ?? 0);
    let uri = next;
    try {
      uri = new URL(next, masterUrl).href;
    } catch {
      // keep
    }
    variants.push({ width, height, bandwidth, uri, audioGroup });
  }

  return { audioTracks, variants };
}

function buildQualityMap(masterUrl: string, variants: MasterVideoVariant[]): StreamQualityMap {
  const quality: StreamQualityMap = {};
  const bandwidthForKey: Record<string, number> = {};
  for (const v of variants) {
    const key = bucketQualityLabel(v.width, v.height);
    const prev = bandwidthForKey[key] ?? -1;
    if (v.bandwidth >= prev) {
      bandwidthForKey[key] = v.bandwidth;
      quality[key] = masterUrl;
    }
  }
  if (!Object.keys(quality).length) {
    quality['720'] = masterUrl;
  }
  return quality;
}

/**
 * Match embess audio name index → EXT-X-MEDIA track (NAME ends with index digits).
 */
export function matchAudioPlaylistUri(
  audioTracks: MasterAudioTrack[],
  nameIndex: number
): string | undefined {
  const bySuffix = audioTracks.find((t) => {
    const m = t.name.match(/(\d+)$/);
    return m != null && Number(m[1]) === nameIndex;
  });
  if (bySuffix) return bySuffix.uri;
  // Embess CDN: NAME may omit the index while URI is `index-a{n+1}.m3u8`.
  const byUriIndex = audioTracks.find((t) => {
    const m = t.uri.match(/index-a(\d+)/i);
    return m != null && Number(m[1]) === nameIndex + 1;
  });
  if (byUriIndex) return byUriIndex.uri;
  return audioTracks[nameIndex]?.uri;
}

export function buildEmbessStreamPayload(
  source: EmbessSource,
  masterText: string,
  masterUrl: string
): StreamPayload | null {
  const { audioTracks, variants } = parseMasterPlaylist(masterText, masterUrl);
  const quality = buildQualityMap(masterUrl, variants);

  const displayOrder =
    source.audio.order.length > 0 ? source.audio.order : source.audio.names.map((_, i) => i);

  const hlsSource: HlsSource[] = [];
  for (const nameIndex of displayOrder) {
    const label = source.audio.names[nameIndex];
    if (!label || /^delete$/i.test(label.trim())) continue;
    const audioId = matchAudioPlaylistUri(audioTracks, nameIndex);
    hlsSource.push({
      label,
      quality: { ...quality },
      ...(audioId ? { audioId } : {}),
    });
  }

  // If names missing, fall back to master audio track names.
  if (!hlsSource.length && audioTracks.length) {
    for (const track of audioTracks) {
      hlsSource.push({
        label: track.name,
        quality: { ...quality },
        audioId: track.uri,
      });
    }
  }

  if (!hlsSource.length) {
    hlsSource.push({ label: 'Default', quality: { ...quality } });
  }

  const tracks: CaptionTrack[] = source.cc
    .filter((c) => c.url)
    .map((c) => ({
      kind: 'captions',
      label: c.name || 'CC',
      src: c.url,
    }));

  if (!tracks.length) {
    tracks.push({ kind: 'captions', label: '—', src: '' });
  }

  return { hlsSource, tracks };
}

/** Hermes-safe timeout — AbortSignal.timeout is missing on some RN runtimes.
 * Prefer Promise.race over AbortSignal: passing `signal` to fetch hangs on some
 * Android OkHttp stacks (Xiaomi), while the same host is reachable without it.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    /* istanbul ignore else -- timer is always set before race settles */
    if (timer) clearTimeout(timer);
  });
}

async function fetchTextOkHttp(url: string, referer: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': USER_AGENT,
      Referer: referer,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchText(url: string, referer: string, playerUrl?: string): Promise<string> {
  // Keep fsst.online as-is: it 301s to incvideo1.online, which some mobile
  // networks cannot reach at all (ERR_CONNECTION_TIMED_OUT). Chrome still needs
  // the redirect hop from a reachable fsst host when the CDN is available.
  const sessionPlayer = playerUrl || referer;
  if (isWebViewHtmlFetcherReady()) {
    try {
      return await fetchHtmlViaWebView(url, referer, {
        timeoutMs: 90000,
        playerUrl: /(?:embess|namy|domem)\.ws|fsst\.online|incvideo/i.test(sessionPlayer)
          ? sessionPlayer
          : url,
      });
    } catch (webErr) {
      console.warn('[embedStreams] WebView embed fetch failed, trying OkHttp', url, webErr);
      return await withTimeout(fetchTextOkHttp(url, referer), 12000, 'embed OkHttp');
    }
  }
  return await withTimeout(fetchTextOkHttp(url, referer), 12000, 'embed OkHttp');
}

/** True when media URL is progressive (MP4), not an HLS master. */
export function isProgressiveMediaUrl(url: string): boolean {
  const bare = url.split('?')[0].toLowerCase();
  // Embess CDN paths look like `…/file.mp4/master.m3u8` — HLS, not progressive.
  if (/\.m3u8(\/|$)/i.test(bare)) return false;
  return /\.(mp4|webm|mkv|mov)$/i.test(bare);
}

export function isFsstPlaylistUrl(url: string): boolean {
  return /\/playlist_iframe\//i.test(url);
}

/** Parse `Кухня 2-1` / `Кухня 2 - 12` style comments into season/episode. */
export function parseFsstEpisodeComment(comment: string): {
  season?: number;
  episode?: number;
} {
  const m = comment.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (!m) return {};
  return { season: Number(m[1]), episode: Number(m[2]) };
}

/**
 * Progressive quality map from a `[720p]url,[360p]url` file string (or HTML blob).
 */
export function parseFsstQualityMap(fileOrHtml: string): StreamQualityMap {
  const map: StreamQualityMap = {};
  const re = /\[(\d{3,4})p\](https?:\/\/[^\s"'<>,\]]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileOrHtml))) {
    map[m[1]] = m[2].replace(/\/$/, '');
  }
  const alt = /https?:\/\/[^\s"'<>]+?_(\d{3,4})p[^\s"'<>]*\.mp4[^\s"'<>]*/gi;
  while ((m = alt.exec(fileOrHtml))) {
    const q = m[1];
    if (q && !map[q]) map[q] = m[0].replace(/\/$/, '');
  }
  return map;
}

/**
 * Progressive MP4 qualities from fsst / incvideo embed HTML (`video_alt_url` style).
 */
export function parseFsstProgressiveSources(html: string): HlsSource | null {
  const map = parseFsstQualityMap(html);
  if (!Object.keys(map).length) return null;
  return { label: 'Default', quality: map };
}

/**
 * Serial episode list from fsst `playlist_iframe` Playerjs `file: [{comment,file},...]`.
 */
export function parseFsstPlaylistEpisodes(html: string): HlsSource[] {
  const fileKey = html.search(/\bfile\s*:/);
  if (fileKey < 0) return [];
  const bracket = html.indexOf('[', fileKey);
  if (bracket < 0) return [];

  let depth = 0;
  let end = -1;
  let inString: '"' | "'" | null = null;
  let escaped = false;
  for (let i = bracket; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];

  const literal = html.slice(bracket, end + 1);
  const episodes: HlsSource[] = [];
  const entryRe =
    /\{\s*"comment"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"file"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(literal))) {
    const comment = em[1].replace(/\\(.)/g, '$1').trim();
    const file = em[2].replace(/\\(.)/g, '$1');
    const quality = parseFsstQualityMap(file);
    if (!comment || !Object.keys(quality).length) continue;
    const coords = parseFsstEpisodeComment(comment);
    episodes.push({
      label: comment,
      quality,
      ...(coords.season != null ? { season: coords.season } : {}),
      ...(coords.episode != null ? { episode: coords.episode } : {}),
    });
  }
  return episodes;
}

export type EmbedResolveOpts = {
  season?: number;
  episode?: number;
};

async function payloadFromEmbessSource(
  source: EmbessSource,
  playerUrl: string,
  coords?: { season: number; episode: number }
): Promise<StreamPayload | null> {
  const masterText = await fetchText(source.hls, playerUrl, playerUrl);
  if (!/#EXTM3U/i.test(masterText)) {
    console.warn(
      '[embedStreams] embess master not m3u8',
      playerUrl,
      masterText.slice(0, 120)
    );
    return null;
  }
  const payload = buildEmbessStreamPayload(source, masterText, source.hls);
  /* istanbul ignore next -- buildEmbessStreamPayload always returns a payload */
  if (!payload) return null;
  if (coords) {
    payload.hlsSource = payload.hlsSource.map((s) => ({
      ...s,
      season: coords.season,
      episode: coords.episode,
    }));
  }
  return payload;
}

export async function resolveEmbessStream(
  playerUrl: string,
  opts?: EmbedResolveOpts
): Promise<StreamPayload | null> {
  try {
    const html = await fetchText(playerUrl, `${BASE_URL}/`, playerUrl);
    const playlist = parseEmbessPlaylistEpisodes(html);
    if (playlist.length) {
      const picked = pickEmbessPlaylistEpisode(playlist, opts?.season, opts?.episode);
      /* istanbul ignore else -- playlist.length guarantees a pick */
      if (picked) {
        const fromPlaylist = await payloadFromEmbessSource(picked.source, playerUrl, {
          season: picked.season,
          episode: picked.episode,
        });
        if (fromPlaylist) return fromPlaylist;
      }
    }
    const source = parseEmbessSource(html);
    if (!source) {
      console.warn(
        '[embedStreams] embess parse empty',
        playerUrl,
        html.length,
        /makePlayer|hls\s*:/.test(html),
        html.slice(0, 180).replace(/\s+/g, ' ')
      );
      return null;
    }
    return await payloadFromEmbessSource(source, playerUrl);
  } catch (e) {
    console.warn('[embedStreams] resolveEmbessStream failed', playerUrl, e);
    return null;
  }
}

export async function resolveFsstStream(playerUrl: string): Promise<StreamPayload | null> {
  try {
    // Omit playerUrl arg so session falls back to newdeaf referer; MediaFetch
    // mounts the fsst/incvideo document via the fetch URL itself.
    const html = await fetchText(playerUrl, `${BASE_URL}/`);

    if (isFsstPlaylistUrl(playerUrl)) {
      const episodes = parseFsstPlaylistEpisodes(html);
      if (!episodes.length) {
        console.warn('[embedStreams] fsst playlist parse empty', playerUrl, html.length);
        return null;
      }
      return {
        hlsSource: episodes,
        tracks: [{ kind: 'captions', label: '—', src: '' }],
        progressive: true,
      };
    }
    const source = parseFsstProgressiveSources(html);
    if (!source) {
      console.warn('[embedStreams] fsst progressive parse empty', playerUrl, html.length);
      return null;
    }
    return {
      hlsSource: [source],
      tracks: [{ kind: 'captions', label: '—', src: '' }],
      progressive: true,
    };
  } catch (e) {
    console.warn('[embedStreams] resolveFsstStream failed', playerUrl, e);
    return null;
  }
}

/**
 * Resolve downloadable streams for non-native embeds (embess first, then fsst).
 * Both resolvers soft-fail to null — callers never need try/catch.
 */
export async function resolveEmbedStream(
  playerUrl: string,
  opts?: EmbedResolveOpts
): Promise<StreamPayload | null> {
  if (isEmbessPlayerUrl(playerUrl)) {
    const embess = await resolveEmbessStream(playerUrl, opts);
    if (embess?.hlsSource?.length) return embess;
  }
  if (isFsstPlayerUrl(playerUrl)) {
    return await resolveFsstStream(playerUrl);
  }
  return null;
}
