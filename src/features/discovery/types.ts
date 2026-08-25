import type { MovieSummary } from '@/src/data/catalog/types';

export const RAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_RAIL_ITEMS = 3;

export type DiscoveryRailId =
  | 'site-popular'
  | 'because-you-watched'
  | 'kp-top-250'
  | 'kp-premieres'
  | 'tmdb-trending'
  | 'genre-fantastic'
  | 'genre-serials';

export const DISCOVERY_RAIL_IDS: DiscoveryRailId[] = [
  'site-popular',
  'because-you-watched',
  'kp-top-250',
  'kp-premieres',
  'tmdb-trending',
  'genre-fantastic',
  'genre-serials',
];

export type DiscoveryRailRecord = {
  railId: DiscoveryRailId;
  items: MovieSummary[];
  updatedAt: number;
};

export function isRailStale(updatedAt: number, now = Date.now()): boolean {
  return now - updatedAt >= RAIL_TTL_MS;
}

export function shouldHideRail(items: MovieSummary[]): boolean {
  return items.length < MIN_RAIL_ITEMS;
}
