import type { MovieSummary } from '@/src/data/catalog/types';

export function pickRandomPage(maxPage: number): number {
  const max = Math.max(1, Math.floor(maxPage));
  return 1 + Math.floor(Math.random() * max);
}

export function pickRandomIndex(length: number): number {
  if (length <= 0) return -1;
  return Math.floor(Math.random() * length);
}

export function pickRandomItem<T>(items: T[]): T | undefined {
  const index = pickRandomIndex(items.length);
  if (index < 0) return undefined;
  return items[index];
}

const RANDOM_PAGE_CAP = 20;

export async function pickRandomCatalogMovie(fetchPage: (page: number) => Promise<{
  items: MovieSummary[];
  hasMore: boolean;
}>): Promise<MovieSummary | undefined> {
  const first = await fetchPage(1);
  if (!first.items.length) return undefined;
  if (!first.hasMore) return pickRandomItem(first.items);

  const page = pickRandomPage(RANDOM_PAGE_CAP);
  if (page === 1) return pickRandomItem(first.items);
  try {
    const next = await fetchPage(page);
    if (next.items.length) return pickRandomItem(next.items);
  } catch {
    // fall through to page 1
  }
  return pickRandomItem(first.items);
}
