import { getKinopoiskApiKey, kpFetch } from './client';
import type { KpCollectionStub, KpCollectionType } from './types';

export const KP_COLLECTION_TYPES: KpCollectionType[] = [
  'TOP_250_MOVIES',
  'TOP_POPULAR_MOVIES',
  'TOP_POPULAR_ALL',
  'TOP_250_TV_SHOWS',
  'POPULAR_SERIES',
  'CLOSES_RELEASES',
];

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;

type CollectionItem = {
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: number | string | null;
  posterUrl?: string | null;
  posterUrlPreview?: string | null;
};

type CollectionResponse = { items?: CollectionItem[] };

function mapItems(items: CollectionItem[] | undefined): KpCollectionStub[] {
  const out: KpCollectionStub[] = [];
  for (const item of items ?? []) {
    const name = (item.nameRu || item.nameOriginal || item.nameEn || '').trim();
    if (name.length < 2) continue;
    out.push({
      nameRu: item.nameRu,
      nameEn: item.nameEn,
      nameOriginal: item.nameOriginal,
      year: item.year,
      posterUrl: item.posterUrl || item.posterUrlPreview,
    });
  }
  return out;
}

export async function fetchKpCollection(
  type: KpCollectionType,
  page = 1
): Promise<KpCollectionStub[]> {
  if (!getKinopoiskApiKey()) return [];
  try {
    const data = await kpFetch<CollectionResponse>(
      `/api/v2.2/films/collections?type=${encodeURIComponent(type)}&page=${page}`
    );
    return mapItems(data.items);
  } catch {
    return [];
  }
}

export function premiereMonth(date = new Date()): (typeof MONTHS)[number] {
  return MONTHS[date.getMonth()] ?? 'JANUARY';
}

export async function fetchKpPremieres(
  year?: number,
  month?: (typeof MONTHS)[number]
): Promise<KpCollectionStub[]> {
  if (!getKinopoiskApiKey()) return [];
  const y = year ?? new Date().getFullYear();
  const m = month ?? premiereMonth();
  try {
    const data = await kpFetch<CollectionResponse>(
      `/api/v2.2/films/premieres?year=${y}&month=${m}`
    );
    return mapItems(data.items);
  } catch {
    return [];
  }
}

/** Legacy `/films/top` — used as a soft-fail fallback for “awaited”. */
export async function fetchKpTop(type: string, page = 1): Promise<KpCollectionStub[]> {
  if (!getKinopoiskApiKey()) return [];
  try {
    const data = await kpFetch<CollectionResponse>(
      `/api/v2.2/films/top?type=${encodeURIComponent(type)}&page=${page}`
    );
    return mapItems(data.items);
  } catch {
    return [];
  }
}
