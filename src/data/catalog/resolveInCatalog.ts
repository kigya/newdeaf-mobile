import { searchMovies } from '@/src/data/catalog/catalog';
import type { MovieSummary } from '@/src/data/catalog/types';

export type CatalogResolveStub = {
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  posterUrl?: string | null;
  year?: string | number | null;
  relationType?: string;
};

export type CatalogResolvedMovie = MovieSummary & {
  relationLabel?: string;
};

const MATCH_THRESHOLD = 40;

export function normalizeCatalogTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»""']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleForCatalogSearch(title: string): string {
  return title
    .replace(/\s*[—–-]\s*S\d+E\d+\s*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s+\d{1,2}\s*$/, '')
    .trim();
}

export function scoreCatalogMatch(
  candidate: {
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    year?: number | string | null;
  },
  title: string,
  year?: string
): number {
  const candTitle = normalizeCatalogTitle(candidate.nameRu || '');
  const candEn = normalizeCatalogTitle(candidate.nameEn || candidate.nameOriginal || '');
  const want = normalizeCatalogTitle(titleForCatalogSearch(title));
  let score = 0;
  if (candTitle === want || candEn === want) score += 100;
  else if (candTitle && (candTitle.includes(want) || want.includes(candTitle))) score += 40;
  else if (candEn && (candEn.includes(want) || want.includes(candEn))) score += 35;
  else return -1;

  if (year) {
    const cy = String(candidate.year ?? '').slice(0, 4);
    if (cy === year) score += 50;
    else if (cy && Math.abs(Number(cy) - Number(year)) <= 1) score += 20;
  }
  return score;
}

/**
 * Resolve foreign catalog stubs (KP/TMDB) back into NewDeaf via site search.
 * Drops misses below the match threshold so rails never show dead posters.
 */
export async function resolveInCatalog(
  stubs: CatalogResolveStub[],
  limit: number
): Promise<CatalogResolvedMovie[]> {
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
        let bestScore = scoreCatalogMatch(
          { nameRu: best.title, nameOriginal: best.title, year: best.year },
          name,
          year
        );
        for (const hit of hits.slice(1, 8)) {
          const score = scoreCatalogMatch(
            { nameRu: hit.title, nameOriginal: hit.title, year: hit.year },
            name,
            year
          );
          if (score > bestScore) {
            bestScore = score;
            best = hit;
          }
        }
        if (bestScore < MATCH_THRESHOLD) return null;
        return {
          movie: {
            ...best,
            relationLabel: stub.relationType,
          } as CatalogResolvedMovie,
        };
      } catch {
        return null;
      }
    })
  );

  const out: CatalogResolvedMovie[] = [];
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
