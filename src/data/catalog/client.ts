import { BASE_URL } from './types';
import { decodeWin1251 } from './win1251';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function charsetFromContentType(header: string | null): 'utf-8' | 'windows-1251' | null {
  if (!header) return null;
  const m = /charset\s*=\s*["']?([^"';\s]+)/i.exec(header);
  if (!m?.[1]) return null;
  const value = m[1].toLowerCase();
  if (value === 'utf-8' || value === 'utf8') return 'utf-8';
  if (
    value === 'windows-1251' ||
    value === 'cp1251' ||
    value === 'cp-1251' ||
    value === 'win-1251'
  ) {
    return 'windows-1251';
  }
  return null;
}

export async function fetchHtml(pathOrUrl: string, init?: RequestInit): Promise<string> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `${BASE_URL}/`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const declared = charsetFromContentType(response.headers.get('content-type'));
  // newdeaf.top is typically windows-1251; only use UTF-8 when declared or BOM-marked.
  if (declared === 'utf-8' || (declared !== 'windows-1251' && hasUtf8Bom(bytes))) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return decodeWin1251(bytes);
}

export function absolutize(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  let out: string;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    out = url;
  } else if (url.startsWith('//')) {
    out = `https:${url}`;
  } else if (url.startsWith('/')) {
    out = `${BASE_URL}${url}`;
  } else {
    out = `${BASE_URL}/${url}`;
  }
  // og:image and some CDN links use newdeaf.site which returns 403
  return out.replace(/https?:\/\/(?:www\.)?newdeaf\.site/gi, BASE_URL);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  ldquo: '\u201C',
  rdquo: '\u201D',
  lsquo: '\u2018',
  rsquo: '\u2019',
  '#039': "'",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&([a-z]+|#039);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      return NAMED_ENTITIES[key] ?? match;
    });
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}
