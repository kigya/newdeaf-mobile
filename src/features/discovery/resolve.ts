import { resolveInCatalog, type CatalogResolveStub } from '@/src/data/catalog/resolveInCatalog';
import type { MovieSummary } from '@/src/data/catalog/types';

import { MIN_RAIL_ITEMS } from './types';

/** Resolve foreign stubs into catalog titles; hide the rail below the floor. */
export async function resolveRailItems(
  stubs: CatalogResolveStub[],
  limit = 16
): Promise<MovieSummary[]> {
  const items = await resolveInCatalog(stubs, limit);
  return items.length >= MIN_RAIL_ITEMS ? items : [];
}

export function keepCatalogRail(items: MovieSummary[]): MovieSummary[] {
  return items.length >= MIN_RAIL_ITEMS ? items : [];
}
