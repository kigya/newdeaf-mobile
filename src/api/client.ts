import { BASE_URL } from './types';
import { decodeWin1251 } from './win1251';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

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
  try {
    return decodeWin1251(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
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

export function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
