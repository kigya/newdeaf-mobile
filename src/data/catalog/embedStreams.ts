import type { CaptionTrack, HlsSource, StreamPayload, StreamQualityMap } from './types';
import { BASE_URL } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export function isEmbessPlayerUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('embess.ws');
  } catch {
    return /embess\.ws/i.test(url);
  }
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

/**
 * Extract balanced `{...}` starting at `openBraceIndex` (must point at `{`).
 * Handles nested braces and string literals with escapes.
 */
export function extractBalancedObject(source: string, openBraceIndex: number): string | null {
  if (source[openBraceIndex] !== '{') return null;
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let escaped = false;
  for (let i = openBraceIndex; i < source.length; i++) {
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
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return null;
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
  const makeIdx = html.search(/makePlayer\s*\(/i);
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

async function fetchText(url: string, referer: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: {
      Accept: '*/*',
      'User-Agent': USER_AGENT,
      Referer: referer,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * Progressive MP4 qualities from fsst / incvideo embed HTML (`video_alt_url` style).
 */
export function parseFsstProgressiveSources(html: string): HlsSource | null {
  // Pattern: ,[720p]https://...mp4/  or 360p / 1080p
  const map: StreamQualityMap = {};
  const re = /\[(\d{3,4})p\](https?:\/\/[^\s"'<>,\]]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    map[m[1]] = m[2].replace(/\/$/, '');
  }
  // Also plain get_file URLs with _360p / _720p
  const alt = /https?:\/\/[^\s"'<>]+?_(\d{3,4})p[^\s"'<>]*\.mp4[^\s"'<>]*/gi;
  while ((m = alt.exec(html))) {
    const q = m[1];
    if (q && !map[q]) map[q] = m[0].replace(/\/$/, '');
  }
  if (!Object.keys(map).length) return null;
  return { label: 'Default', quality: map };
}

export async function resolveEmbessStream(playerUrl: string): Promise<StreamPayload | null> {
  try {
    const html = await fetchText(playerUrl, `${BASE_URL}/`);
    const source = parseEmbessSource(html);
    if (!source) return null;
    const masterText = await fetchText(source.hls, playerUrl);
    if (!/#EXTM3U/i.test(masterText)) return null;
    return buildEmbessStreamPayload(source, masterText, source.hls);
  } catch {
    return null;
  }
}

export async function resolveFsstStream(playerUrl: string): Promise<StreamPayload | null> {
  try {
    const html = await fetchText(playerUrl, `${BASE_URL}/`);
    const source = parseFsstProgressiveSources(html);
    if (!source) return null;
    return {
      hlsSource: [source],
      tracks: [{ kind: 'captions', label: '—', src: '' }],
    };
  } catch {
    return null;
  }
}

/**
 * Resolve downloadable streams for non-native embeds (embess first, then fsst).
 * Both resolvers soft-fail to null — callers never need try/catch.
 */
export async function resolveEmbedStream(playerUrl: string): Promise<StreamPayload | null> {
  if (isEmbessPlayerUrl(playerUrl)) {
    const embess = await resolveEmbessStream(playerUrl);
    if (embess?.hlsSource?.length) return embess;
  }
  if (isFsstPlayerUrl(playerUrl)) {
    return await resolveFsstStream(playerUrl);
  }
  return null;
}
