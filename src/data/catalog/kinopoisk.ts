import { searchMovies } from '@/src/data/catalog/catalog';
import { stripTags } from '@/src/data/catalog/client';
import type { MovieSummary } from '@/src/data/catalog/types';

const KP_API = 'https://kinopoiskapiunofficial.tech';
const API_KEY = process.env.EXPO_PUBLIC_KINOPOISK_API_KEY ?? '';

export type KinopoiskFact = {
  text: string;
  type: 'FACT' | 'BLOOPER' | string;
  spoiler: boolean;
};

export type KinopoiskStaffMember = {
  staffId: number;
  nameRu?: string;
  nameEn?: string;
  description?: string;
  posterUrl?: string;
  professionText?: string;
  professionKey?: string;
};

export type KinopoiskAwardChip = {
  name: string;
};

export type KinopoiskRelatedMovie = MovieSummary & {
  relationLabel?: string;
};

export type KinopoiskEnrichment = {
  kinopoiskId: number;
  facts: KinopoiskFact[];
  staff: KinopoiskStaffMember[];
  awards: KinopoiskAwardChip[];
  similar: KinopoiskRelatedMovie[];
  related: KinopoiskRelatedMovie[];
};

type CacheEntry = KinopoiskEnrichment | null;
const memoryCache = new Map<string, CacheEntry>();
const idCache = new Map<string, number | null>();

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip episode badges / trailing season index for better KP search. */
function titleForSearch(title: string): string {
  return title
    .replace(/\s*[—–-]\s*S\d+E\d+\s*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s+\d{1,2}\s*$/, '')
    .trim();
}

function scoreMatch(
  candidate: {
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    year?: number | string | null;
    type?: string | null;
  },
  title: string,
  year?: string,
  isSeries?: boolean
): number {
  const candTitle = normalizeTitle(candidate.nameRu || '');
  const candEn = normalizeTitle(candidate.nameEn || candidate.nameOriginal || '');
  const want = normalizeTitle(titleForSearch(title));
  let score = 0;
  if (candTitle === want || candEn === want) score += 100;
  else if (candTitle.includes(want) || want.includes(candTitle)) score += 40;
  else if (candEn.includes(want) || want.includes(candEn)) score += 35;
  else return -1;

  if (year) {
    const cy = String(candidate.year ?? '').slice(0, 4);
    if (cy === year) score += 50;
    else if (cy && Math.abs(Number(cy) - Number(year)) <= 1) score += 20;
    else if (isSeries && cy && Math.abs(Number(cy) - Number(year)) <= 15) score += 5;
  }

  const type = (candidate.type || '').toUpperCase();
  if (isSeries && (type === 'TV_SERIES' || type === 'MINI_SERIES' || type === 'TV_SHOW')) {
    score += 25;
  }
  if (!isSeries && type === 'FILM') {
    score += 10;
  }
  return score;
}

async function kpFetch<T>(pathAndQuery: string): Promise<T> {
  if (!API_KEY) {
    throw new Error('Kinopoisk key missing');
  }
  const res = await fetch(`${KP_API}${pathAndQuery}`, {
    headers: {
      Accept: 'application/json',
      'X-API-KEY': API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`Kinopoisk HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

type SearchFilm = {
  filmId?: number;
  kinopoiskId?: number;
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: string | number | null;
  type?: string;
};

type SearchResponse = {
  films?: SearchFilm[];
  items?: SearchFilm[];
};

async function resolveKinopoiskId(input: {
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
}): Promise<number | null> {
  const query = titleForSearch((input.originalTitle || input.title).trim());
  const key = `${normalizeTitle(query)}|${input.year ?? ''}|${input.isSeries ? 's' : 'm'}`;
  if (idCache.has(key)) {
    return idCache.get(key) ?? null;
  }
  if (query.length < 2) {
    idCache.set(key, null);
    return null;
  }

  try {
    const data = await kpFetch<SearchResponse>(
      `/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`
    );
    const list = data.films ?? data.items ?? [];
    let best: SearchFilm | null = null;
    let bestScore = -1;
    for (const film of list) {
      const score = scoreMatch(film, query, input.year, input.isSeries);
      if (score > bestScore) {
        bestScore = score;
        best = film;
      }
    }

    if ((!best || bestScore < 40) && input.originalTitle) {
      const altQuery = titleForSearch(input.originalTitle);
      if (altQuery && normalizeTitle(altQuery) !== normalizeTitle(query)) {
        const alt = await kpFetch<SearchResponse>(
          `/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(altQuery)}&page=1`
        );
        for (const film of alt.films ?? alt.items ?? []) {
          const score = scoreMatch(film, altQuery, input.year, input.isSeries);
          if (score > bestScore) {
            bestScore = score;
            best = film;
          }
        }
      }
    }

    if (!best || bestScore < 40) {
      idCache.set(key, null);
      return null;
    }
    const id = best.filmId ?? best.kinopoiskId ?? null;
    idCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}

type FactsResponse = { items?: KinopoiskFact[] };
type StaffResponse = KinopoiskStaffMember[] | { items?: KinopoiskStaffMember[] };
type AwardsResponse = {
  items?: { name?: string; win?: boolean; nominationName?: string }[];
};
type SimilarResponse = {
  items?: {
    filmId?: number;
    kinopoiskId?: number;
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    posterUrl?: string | null;
    posterUrlPreview?: string | null;
    relationType?: string;
    year?: string | number | null;
  }[];
};

function takeStaff(raw: StaffResponse): KinopoiskStaffMember[] {
  const list = Array.isArray(raw) ? raw : raw.items ?? [];
  const actors = list.filter(
    (s) =>
      s.professionKey === 'ACTOR' ||
      (s.professionText && /акт/i.test(s.professionText))
  );
  const pool = actors.length ? actors : list.filter((s) => s.nameRu || s.nameEn);
  return pool.slice(0, 16);
}

function takeAwards(raw: AwardsResponse): KinopoiskAwardChip[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of raw.items ?? []) {
    if (!item.win || !item.name) continue;
    const name = item.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= 6) break;
  }
  return names.map((name) => ({ name }));
}

function takeFacts(raw: FactsResponse): KinopoiskFact[] {
  const items = raw.items ?? [];
  const facts = items.filter((f) => f.type === 'FACT' && f.text?.trim());
  const pool = facts.length ? facts : items.filter((f) => f.text?.trim());
  return pool
    .slice(0, 5)
    .map((f) => ({
      text: stripTags(f.text),
      type: f.type,
      spoiler: Boolean(f.spoiler),
    }))
    .filter((f) => f.text.length > 0);
}

async function resolveInNewDeaf(
  stubs: {
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    posterUrl?: string | null;
    year?: string | number | null;
    relationType?: string;
  }[],
  limit: number
): Promise<KinopoiskRelatedMovie[]> {
  const candidates = stubs
    .map((stub) => ({
      stub,
      name: (stub.nameRu || stub.nameOriginal || stub.nameEn || '').trim(),
    }))
    .filter((c) => c.name.length >= 4)
    .slice(0, Math.max(limit * 2, limit));

  const results = await Promise.all(
    candidates.map(async ({ stub, name }) => {
      try {
        const hits = await searchMovies(name);
        if (!hits.length) return null;
        const year = stub.year != null ? String(stub.year).slice(0, 4) : undefined;
        let best = hits[0];
        let bestScore = scoreMatch(
          { nameRu: best.title, nameOriginal: best.title, year: best.year },
          name,
          year
        );
        for (const hit of hits.slice(1, 8)) {
          const score = scoreMatch(
            { nameRu: hit.title, nameOriginal: hit.title, year: hit.year },
            name,
            year
          );
          if (score > bestScore) {
            bestScore = score;
            best = hit;
          }
        }
        if (bestScore < 40) return null;
        return {
          movie: {
            ...best,
            relationLabel: stub.relationType,
          } as KinopoiskRelatedMovie,
        };
      } catch {
        return null;
      }
    })
  );

  const out: KinopoiskRelatedMovie[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item) continue;
    if (seen.has(item.movie.id)) continue;
    seen.add(item.movie.id);
    out.push(item.movie);
    if (out.length >= limit) break;
  }
  return out;
}

export function isKinopoiskConfigured(): boolean {
  return Boolean(API_KEY);
}

/**
 * Enrich movie detail with Kinopoisk Unofficial data.
 * Calls `onPartial` as soon as facts/staff/awards are ready, then again with similar/related.
 * Returns null when unconfigured / no confident match. Soft-fails per section.
 */
export async function enrichFromKinopoisk(
  input: {
    newdeafId: string;
    title: string;
    originalTitle?: string;
    year?: string;
    isSeries?: boolean;
  },
  onPartial?: (data: KinopoiskEnrichment) => void
): Promise<KinopoiskEnrichment | null> {
  if (!API_KEY) return null;

  const cacheKey = `${input.newdeafId}|${normalizeTitle(input.originalTitle || input.title)}|${input.year ?? ''}`;
  if (memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey) ?? null;
    if (cached && onPartial) onPartial(cached);
    return cached;
  }

  try {
    const kinopoiskId = await resolveKinopoiskId(input);
    if (!kinopoiskId) {
      memoryCache.set(cacheKey, null);
      return null;
    }

    const [factsRes, staffRes, awardsRes, similarRes, relationsRes] = await Promise.all([
      kpFetch<FactsResponse>(`/api/v2.2/films/${kinopoiskId}/facts`).catch(() => ({ items: [] })),
      kpFetch<StaffResponse>(`/api/v1/staff?filmId=${kinopoiskId}`).catch(() => []),
      kpFetch<AwardsResponse>(`/api/v2.2/films/${kinopoiskId}/awards`).catch(() => ({ items: [] })),
      kpFetch<SimilarResponse>(`/api/v2.2/films/${kinopoiskId}/similars`).catch(() => ({
        items: [],
      })),
      kpFetch<SimilarResponse>(`/api/v2.2/films/${kinopoiskId}/relations`).catch(() => ({
        items: [],
      })),
    ]);

    const partial: KinopoiskEnrichment = {
      kinopoiskId,
      facts: takeFacts(factsRes),
      staff: takeStaff(staffRes),
      awards: takeAwards(awardsRes),
      similar: [],
      related: [],
    };
    onPartial?.(partial);

    const [similar, related] = await Promise.all([
      resolveInNewDeaf(similarRes.items ?? [], 6),
      resolveInNewDeaf(relationsRes.items ?? [], 4),
    ]);

    const enrichment: KinopoiskEnrichment = {
      ...partial,
      similar,
      related,
    };
    memoryCache.set(cacheKey, enrichment);
    onPartial?.(enrichment);
    return enrichment;
  } catch {
    return null;
  }
}
