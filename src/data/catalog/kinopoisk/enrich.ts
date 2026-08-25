import { stripTags } from '@/src/data/catalog/client';
import { resolveInCatalog } from '@/src/data/catalog/resolveInCatalog';

import { getKinopoiskApiKey, kpFetch } from './client';
import { normalizeTitle, resolveKinopoiskId } from './match';
import type {
  KinopoiskAwardChip,
  KinopoiskEnrichment,
  KinopoiskFact,
  KinopoiskStaffMember,
} from './types';

type CacheEntry = KinopoiskEnrichment | null;
const memoryCache = new Map<string, CacheEntry>();

type FactsResponse = { items?: KinopoiskFact[] };
type StaffResponse = KinopoiskStaffMember[] | { items?: KinopoiskStaffMember[] };
type AwardsResponse = {
  items?: { name?: string; win?: boolean; nominationName?: string }[];
};
type SimilarResponse = {
  items?: {
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    posterUrl?: string | null;
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
  if (!getKinopoiskApiKey()) return null;

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
      resolveInCatalog(similarRes.items ?? [], 6),
      resolveInCatalog(relationsRes.items ?? [], 4),
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
