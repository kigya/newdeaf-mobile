import { absolutize, stripTags } from './client';
import { parseMovieIdFromHref } from './parse';
import type { MovieSummary } from './types';

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*с русскими субтитрами.*/i, '')
    .replace(/\s*русские субтитры.*/i, '')
    .replace(/\s*онлайн.*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(title: string): string | undefined {
  const m = title.match(/\((\d{4}(?:\s*-\s*\d{4})?)\)/);
  return m?.[1];
}

/**
 * Homepage `#owl-popular` carousel. Returns [] when markup is missing/changed.
 */
export function parsePopularCarousel(html: string): MovieSummary[] {
  const start = html.search(/id=["']owl-popular["']/i);
  if (start < 0) return [];
  const rest = html.slice(start);
  const next = rest.slice(20).search(/id=["']owl-/i);
  const chunk = next >= 0 ? rest.slice(0, next + 20) : rest.slice(0, 180000);

  const byId = new Map<string, MovieSummary>();
  const itemRe =
    /class="popular-item-img[^"]*"\s+href="([^"]+)"[\s\S]{0,800}?class="popular-item-title[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]{0,400}?<img[^>]*\bsrc="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(chunk)) !== null) {
    const parsed = parseMovieIdFromHref(match[1]);
    if (!parsed || byId.has(parsed.id)) continue;
    const title = cleanTitle(stripTags(match[2]));
    if (!title) continue;
    byId.set(parsed.id, {
      id: parsed.id,
      slug: parsed.slug,
      title,
      year: extractYear(title) ?? extractYear(parsed.slug),
      posterUrl: absolutize(match[3]),
      href: parsed.href,
    });
  }
  return Array.from(byId.values());
}
