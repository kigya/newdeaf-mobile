import { absolutize, stripTags } from './client';
import type { MovieDetail, MovieSummary } from './types';

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

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*с русскими субтитрами.*/i, '')
    .replace(/\s*русские субтитры.*/i, '')
    .replace(/\s*онлайн.*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMovieList(html: string): MovieSummary[] {
  const byId = new Map<string, MovieSummary>();

  const popularRe =
    /<a[^>]*class="[^"]*popular-item-img[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = popularRe.exec(html)) !== null) {
    const parsed = parseMovieIdFromHref(match[1]);
    if (!parsed || byId.has(parsed.id)) continue;
    const block = match[2];
    const titleFromDiv = block.match(/popular-item-title[^>]*>([^<]+)</i)?.[1];
    const imgTag = block.match(/<img\b[^>]*>/i)?.[0] ?? '';
    const alt = imgTag.match(/\balt="([^"]*)"/i)?.[1];
    const src = imgTag.match(/\bsrc="([^"]+)"/i)?.[1];
    const title = cleanTitle(stripTags(titleFromDiv || alt || titleFromSlug(parsed.slug)));
    byId.set(parsed.id, {
      id: parsed.id,
      slug: parsed.slug,
      title,
      year: extractYear(title) ?? extractYear(parsed.slug),
      posterUrl: absolutize(src),
      href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
    });
  }

  // Short story / grid cards
  const gridRe =
    /<a[^>]*href="(\/\d+-[^"]+\.html)"[^>]*>([\s\S]{0,800}?)<\/a>/gi;
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
    });
  }

  // Fallback: any movie links
  if (byId.size < 8) {
    const linkRe = /href="(\/\d+-[^"#?]+\.html)"/gi;
    while ((match = linkRe.exec(html)) !== null) {
      const parsed = parseMovieIdFromHref(match[1]);
      if (!parsed || byId.has(parsed.id)) continue;
      const title = titleFromSlug(parsed.slug);
      byId.set(parsed.id, {
        id: parsed.id,
        slug: parsed.slug,
        title,
        year: extractYear(title),
        href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
      });
    }
  }

  return Array.from(byId.values());
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
    // Look for nearby poster in the surrounding card (~1200 chars before the match)
    const start = Math.max(0, match.index - 1200);
    const window = html.slice(start, match.index + match[0].length + 400);
    const imgSrc =
      window.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i)?.[1] ??
      window.match(/uploads\/(?:blockpro|posts)\/[^"'\s]+/i)?.[0];
    byId.set(parsed.id, {
      id: parsed.id,
      slug: parsed.slug,
      title,
      year: extractYear(title) ?? extractYear(parsed.slug),
      posterUrl: absolutize(imgSrc),
      href: parsed.href.startsWith('/') ? parsed.href : `/${parsed.href}`,
    });
  }

  // Alternate markup: short-title then parent link, or movie link with absolute URL nearby
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
  title = title.replace(/\s*\/\s*.*$/, (part) => {
    // Keep "F1 / F1 (2025)" style — prefer the part with year
    return part;
  });
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

  // Primary player: stloadi / alloha-like
  const playerMatch =
    html.match(
      /src="(https?:\/\/[^"]*stloadi\.live[^"]+)"/i
    ) ??
    html.match(
      /src="(https?:\/\/biorn-as\.[^"]+)"/i
    ) ??
    html.match(
      /src="(https?:\/\/[^"]+:9443\/\?token=[^"]+)"/i
    );

  const playerUrl = playerMatch?.[1];
  let playerToken: string | undefined;
  let tokenMovie: string | undefined;
  let translationId: string | undefined;
  if (playerUrl) {
    try {
      const u = new URL(playerUrl);
      playerToken = u.searchParams.get('token') ?? undefined;
      tokenMovie = u.searchParams.get('token_movie') ?? undefined;
      translationId = u.searchParams.get('translation') ?? undefined;
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
    likes,
    trailerUrl,
    trailerYoutubeId,
    originalTitle,
  };
}
