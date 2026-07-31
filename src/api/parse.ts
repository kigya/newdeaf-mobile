import { absolutize, stripTags } from './client';
import type { MovieDetail, MovieSummary, PlayerFileList, PlayerFileListEntry } from './types';

export function parseMovieIdFromHref(href: string): { id: string; slug: string; href: string } | null {
  const full = href.match(/\/(\d+)-([^/"#?]+)\.html/);
  if (full) {
    return { id: full[1], slug: full[2], href: `/` + full[0].replace(/^\//, '') };
  }
  const newsid = href.match(/newsid=(\d+)/);
  if (newsid) {
    return { id: newsid[1], slug: newsid[1], href: `/www/index.php?newsid=${newsid[1]}` };
  }
  return null;
}

function titleFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractYear(title: string): string | undefined {
  const m = title.match(/\((\d{4}(?:\s*-\s*\d{4})?)\)/);
  return m?.[1];
}

/** Prefer a single release year for filtering (take the first year in a range). */
export function primaryYear(year?: string): number | undefined {
  if (!year) return undefined;
  const m = year.match(/(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*с русскими субтитрами.*/i, '')
    .replace(/\s*русские субтитры.*/i, '')
    .replace(/\s*онлайн.*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRatings(block: string): { kpRating?: string; imdbRating?: string } {
  const kpRating =
    block.match(/short-rate-kp[^>]*>\s*<span>([^<]+)<\/span>/i)?.[1]?.trim() ??
    block.match(/data-text="kp"[^>]*>\s*<span>([0-9.]+)<\/span>/i)?.[1]?.trim();
  const imdbRating =
    block.match(/short-rate-imdb[^>]*>\s*<span>([^<]+)<\/span>/i)?.[1]?.trim() ??
    block.match(/data-text="imdb"[^>]*>\s*<span>([0-9.]+)<\/span>/i)?.[1]?.trim();
  return { kpRating, imdbRating };
}

function detectIsSeries(block: string, title: string, slug: string): boolean {
  if (/Сериалы/i.test(block)) return true;
  if (/сезон|сериал|sezon|serial/i.test(title)) return true;
  if (/sezon|serial|сезон|сериал/i.test(slug)) return true;
  return false;
}

/**
 * Parse catalog grid cards (`.short-cols`). Ignores sidebar popular items so
 * pagination across `/page/N/` actually returns new movies.
 */
export function parseMovieList(html: string): MovieSummary[] {
  const byId = new Map<string, MovieSummary>();

  const shortColsRe =
    /<div[^>]*class="[^"]*short-cols[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*short-cols|class="navigation|<div[^>]*id="footer"|<\/main>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = shortColsRe.exec(html)) !== null) {
    const block = match[1];
    const hrefMatch =
      block.match(/<a[^>]*class="[^"]*short-img[^"]*"[^>]*href="([^"]+)"/i) ??
      block.match(/href="((?:https?:\/\/[^"]+)?\/\d+-[^"]+\.html)"/i);
    if (!hrefMatch) continue;
    const parsed = parseMovieIdFromHref(hrefMatch[1]);
    if (!parsed || byId.has(parsed.id)) continue;

    const titleRaw =
      block.match(/class="[^"]*short-title[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ??
      block.match(/<img\b[^>]*\balt="([^"]+)"/i)?.[1];
    const title = cleanTitle(stripTags(titleRaw || titleFromSlug(parsed.slug)));
    const imgSrc =
      block.match(/<a[^>]*class="[^"]*short-img[^"]*"[^>]*>[\s\S]*?<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] ??
      block.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i)?.[1];
    const { kpRating, imdbRating } = extractRatings(block);

    byId.set(parsed.id, {
      id: parsed.id,
      slug: parsed.slug,
      title,
      year: extractYear(title) ?? extractYear(parsed.slug),
      posterUrl: absolutize(imgSrc),
      href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
      kpRating,
      imdbRating,
      isSeries: detectIsSeries(block, title, parsed.slug),
    });
  }

  // Fallback for thinner pages
  if (byId.size < 4) {
    const gridRe = /<a[^>]*href="((?:https?:\/\/[^"]+)?\/\d+-[^"]+\.html)"[^>]*>([\s\S]{0,800}?)<\/a>/gi;
    while ((match = gridRe.exec(html)) !== null) {
      const parsed = parseMovieIdFromHref(match[1]);
      if (!parsed || byId.has(parsed.id)) continue;
      const block = match[2];
      const imgTag = block.match(/<img\b[^>]*>/i)?.[0] ?? '';
      if (!imgTag) continue;
      const alt = imgTag.match(/\balt="([^"]*)"/i)?.[1];
      const src = imgTag.match(/\bsrc="([^"]+)"/i)?.[1];
      if (!src || !/uploads|blockpro|poster/i.test(src)) continue;
      const title = cleanTitle(stripTags(alt || titleFromSlug(parsed.slug)));
      byId.set(parsed.id, {
        id: parsed.id,
        slug: parsed.slug,
        title,
        year: extractYear(title) ?? extractYear(parsed.slug),
        posterUrl: absolutize(src),
        href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
        isSeries: detectIsSeries(block, title, parsed.slug),
      });
    }
  }

  return Array.from(byId.values());
}

/** True when `.navigation` has a link to a higher page number than current. */
export function parseHasMorePages(html: string, currentPage: number): boolean {
  const nav = html.match(/class="[^"]*navigation[^"]*"[\s\S]{0,1500}/i)?.[0];
  if (!nav) return false;
  const hrefPages = Array.from(nav.matchAll(/\/(?:[\w-]+\/)*page\/(\d+)\//gi)).map((m) =>
    Number(m[1])
  );
  const absolutePages = Array.from(nav.matchAll(/\/(\d{4})\/page\/(\d+)\//gi)).map((m) =>
    Number(m[2])
  );
  const all = [...hrefPages, ...absolutePages];
  return all.some((n) => Number.isFinite(n) && n > currentPage);
}

export function parseCatalogPage(
  html: string,
  currentPage: number
): { items: MovieSummary[]; hasMore: boolean } {
  const items = parseMovieList(html);
  const hasMore =
    parseHasMorePages(html, currentPage) ||
    // Heuristic: full page of short cards usually means more exists
    items.length >= 20;
  return { items, hasMore };
}

/** Search-page hits use absolute movie URLs + short-title; ignore popular sidebar. */
export function parseSearchResults(html: string): MovieSummary[] {
  const byId = new Map<string, MovieSummary>();

  const shortTitleRe =
    /<a[^>]+href="([^"]+)"[^>]*>\s*<span[^>]*class="[^"]*short-title[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let match: RegExpExecArray | null;
  while ((match = shortTitleRe.exec(html)) !== null) {
    const parsed = parseMovieIdFromHref(match[1]);
    if (!parsed || byId.has(parsed.id)) continue;
    const title = cleanTitle(stripTags(match[2]));
    const start = Math.max(0, match.index - 1200);
    const window = html.slice(start, match.index + match[0].length + 400);
    const imgSrc =
      window.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i)?.[1] ??
      window.match(/uploads\/(?:blockpro|posts)\/[^"'\s]+/i)?.[0];
    const { kpRating, imdbRating } = extractRatings(window);
    byId.set(parsed.id, {
      id: parsed.id,
      slug: parsed.slug,
      title,
      year: extractYear(title) ?? extractYear(parsed.slug),
      posterUrl: absolutize(imgSrc),
      href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
      kpRating,
      imdbRating,
      isSeries: detectIsSeries(window, title, parsed.slug),
    });
  }

  if (byId.size === 0) {
    const absLinkRe = /href="(https?:\/\/[^"]*?\/\d+-[^"/?#]+\.html)"/gi;
    while ((match = absLinkRe.exec(html)) !== null) {
      const parsed = parseMovieIdFromHref(match[1]);
      if (!parsed || byId.has(parsed.id)) continue;
      const nearby = html.slice(match.index, match.index + 500);
      const titleRaw =
        nearby.match(/short-title[^>]*>([\s\S]*?)<\/span>/i)?.[1] ??
        nearby.match(/<img\b[^>]*\balt="([^"]+)"/i)?.[1];
      const title = cleanTitle(stripTags(titleRaw || titleFromSlug(parsed.slug)));
      const imgSrc = nearby.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1];
      byId.set(parsed.id, {
        id: parsed.id,
        slug: parsed.slug,
        title,
        year: extractYear(title) ?? extractYear(parsed.slug),
        posterUrl: absolutize(imgSrc),
        href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
        isSeries: detectIsSeries(nearby, title, parsed.slug),
      });
    }
  }

  return Array.from(byId.values());
}

function extractMetaList(html: string, label: string): string[] {
  const re = new RegExp(`${label}:\\s*</[^>]+>\\s*([\\s\\S]*?)</li>`, 'i');
  const m = html.match(re) ?? html.match(new RegExp(`${label}:\\s*([\\s\\S]*?)</li>`, 'i'));
  if (!m) return [];
  const chunk = m[1];
  const links = Array.from(chunk.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)).map((x) => stripTags(x[1]));
  if (links.length) return links.filter(Boolean);
  return stripTags(chunk)
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractGenreLinks(html: string): { name: string; href: string }[] {
  const m =
    html.match(/Жанр:\s*([\s\S]*?)<\/li>/i) ??
    html.match(/Жанр:<\/[^>]+>\s*([\s\S]*?)<\/li>/i);
  if (!m) return [];
  return Array.from(m[1].matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)).map((x) => ({
    href: x[1],
    name: stripTags(x[2]),
  }));
}

function extractDetailPoster(html: string): string | undefined {
  const candidates = [
    html.match(/<img[^>]*class="[^"]*puk-puk[^"]*"[^>]*src="([^"]+)"/i)?.[1],
    html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*puk-puk[^"]*"/i)?.[1],
    html.match(/class="[^"]*poster[^"]*"[^>]*>[\s\S]*?src="([^"]+)"/i)?.[1],
    html.match(/uploads\/posts\/[^"'\s]+/i)?.[0],
    html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1],
  ];
  for (const c of candidates) {
    const url = absolutize(c);
    if (url) return url;
  }
  return undefined;
}

export function parseMovieDetail(html: string, fallbackHref: string): MovieDetail {
  const parsedHref = parseMovieIdFromHref(fallbackHref);
  const id = parsedHref?.id ?? '0';
  const slug = parsedHref?.slug ?? id;

  const ogTitle =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ??
    '';
  let title = cleanTitle(stripTags(ogTitle).replace(/^NewDeaf(?:\.[Rr][Uu])?\s*[:|]?\s*/i, ''));
  title = title.replace(/\s*\/\s*.*$/, (part) => part);
  if (title.includes('/')) {
    const parts = title.split('/').map((p) => p.trim());
    title = parts.find((p) => /\(\d{4}/.test(p)) ?? parts[parts.length - 1] ?? title;
  }
  title = cleanTitle(title);

  const posterUrl = extractDetailPoster(html);

  const kpRating =
    html.match(/short-rate-in\s+short-rate-kp[^>]*>\s*<span>([^<]+)<\/span>/i)?.[1]?.trim() ??
    html.match(/data-text="kp"[^>]*>\s*<span>([0-9.]+)<\/span>/i)?.[1];
  const imdbRating =
    html.match(/short-rate-in\s+short-rate-imdb[^>]*>\s*<span>([^<]+)<\/span>/i)?.[1]?.trim() ??
    html.match(/data-text="imdb"[^>]*>\s*<span>([0-9.]+)<\/span>/i)?.[1];

  const description =
    stripTags(
      html.match(/id="fltxt"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/class="[^"]*full-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
        html.match(/itemprop="description"[^>]*>([\s\S]*?)<\//i)?.[1] ??
        ''
    ) || undefined;

  const genres = extractMetaList(html, 'Жанр');
  const genreHrefs = extractGenreLinks(html);
  const actors = extractMetaList(html, 'Актеры').length
    ? extractMetaList(html, 'Актеры')
    : extractMetaList(html, 'Актёры');
  const country = extractMetaList(html, 'Страна')[0];
  const director = extractMetaList(html, 'Режиссер')[0] ?? extractMetaList(html, 'Режиссёр')[0];
  const durationMatch =
    html.match(/Время:\s*<\/[^>]+>\s*([\s\S]*?)<\/li>/i) ??
    html.match(/Время:\s*([\s\S]*?)<\/li>/i);
  const duration = durationMatch
    ? stripTags(durationMatch[1]).replace(/\s+/g, ' ').trim() || undefined
    : undefined;

  const likes =
    html.match(/id="l-\d+"[^>]*>\s*\+?(\d+)/i)?.[1] ??
    html.match(/class="count"[^>]*>\+?(\d+)/i)?.[1];

  const playerMatch =
    html.match(/src="(https?:\/\/[^"]*stloadi\.live[^"]+)"/i) ??
    html.match(/src="(https?:\/\/biorn-as\.[^"]+)"/i) ??
    html.match(/src="(https?:\/\/[^"]+:9443\/\?token=[^"]+)"/i);

  const playerUrl = playerMatch?.[1];
  let playerToken: string | undefined;
  let tokenMovie: string | undefined;
  let translationId: string | undefined;
  let season: number | undefined;
  let episode: number | undefined;
  if (playerUrl) {
    try {
      const u = new URL(playerUrl);
      playerToken = u.searchParams.get('token') ?? undefined;
      tokenMovie = u.searchParams.get('token_movie') ?? undefined;
      translationId = u.searchParams.get('translation') ?? undefined;
      const s = u.searchParams.get('season');
      const e = u.searchParams.get('episode');
      if (s) season = Number(s) || undefined;
      if (e) episode = Number(e) || undefined;
    } catch {
      // ignore
    }
  }

  const trailerEmbed =
    html.match(/data-tr="(https?:\/\/(?:www\.)?youtube\.com\/embed\/[^"]+)"/i)?.[1] ??
    html.match(/data-tr="(https?:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/[^"]+)"/i)?.[1];
  const trailerYoutubeId = trailerEmbed?.match(/embed\/([\w-]{6,})/i)?.[1];
  const trailerUrl = trailerYoutubeId
    ? `https://www.youtube-nocookie.com/embed/${trailerYoutubeId}`
    : trailerEmbed;
  const originalTitle = html.match(/data-original_title="([^"]+)"/i)?.[1]?.trim() || undefined;

  return {
    id,
    slug,
    title: title || titleFromSlug(slug),
    year: extractYear(title) ?? extractYear(slug),
    posterUrl,
    href: parsedHref?.href?.startsWith('/') ? parsedHref.href : `/${id}-${slug}.html`,
    kpRating,
    imdbRating,
    description,
    country,
    duration,
    genres,
    genreHrefs,
    actors,
    director,
    playerUrl,
    playerToken,
    tokenMovie,
    translationId,
    season,
    episode,
    likes,
    trailerUrl,
    trailerYoutubeId,
    originalTitle,
  };
}

/** Decode JS string literal as used in player `JSON.parse('...')`. */
function decodeJsStringLiteral(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

export function parsePlayerFileList(html: string): PlayerFileList | null {
  const m = html.match(/const\s+fileList\s*=\s*JSON\.parse\('([\s\S]*?)'\);/);
  if (!m) return null;
  try {
    const data = JSON.parse(decodeJsStringLiteral(m[1])) as {
      type?: string;
      active?: PlayerFileListEntry;
      all?: Record<string, Record<string, Record<string, PlayerFileListEntry>>>;
    };
    if (!data?.all) return null;
    return {
      type: data.type === 'serial' ? 'serial' : 'movie',
      active: data.active,
      all: data.all,
    };
  } catch {
    return null;
  }
}

export function buildPlayerUrl(
  basePlayerUrl: string,
  opts: { season?: number; episode?: number; translation?: number | string; time?: number }
): string {
  try {
    const u = new URL(basePlayerUrl);
    if (opts.season != null) u.searchParams.set('season', String(opts.season));
    if (opts.episode != null) u.searchParams.set('episode', String(opts.episode));
    if (opts.translation != null) u.searchParams.set('translation', String(opts.translation));
    if (opts.time != null && opts.time > 0) {
      u.searchParams.set('time', String(Math.floor(opts.time)));
    }
    return u.toString();
  } catch {
    return basePlayerUrl;
  }
}

export function listSeasons(fileList: PlayerFileList): number[] {
  return Object.keys(fileList.all)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function listEpisodes(fileList: PlayerFileList, season: number): number[] {
  const eps = fileList.all[String(season)] ?? {};
  return Object.keys(eps)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function pickEpisodeEntry(
  fileList: PlayerFileList,
  season: number,
  episode: number,
  preferredTranslation?: number
): PlayerFileListEntry | null {
  const translations = fileList.all[String(season)]?.[String(episode)];
  if (!translations) return null;
  const values = Object.values(translations);
  if (!values.length) return null;
  if (preferredTranslation != null) {
    const preferred = values.find((v) => v.id_translation === preferredTranslation);
    if (preferred) return preferred;
  }
  // Prefer "Субтитры" / id 79 when present
  const subs = values.find((v) => /субтитр/i.test(v.translation) || v.id_translation === 79);
  return subs ?? values[0];
}
