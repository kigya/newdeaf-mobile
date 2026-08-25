jest.mock('@/src/data/catalog/resolveInCatalog', () => ({
  resolveInCatalog: jest.fn(async () => []),
}));

import { resolveInCatalog } from '@/src/data/catalog/resolveInCatalog';
import { keepCatalogRail, resolveRailItems } from '@/src/features/discovery/resolve';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie = (id: string): MovieSummary => ({
  id,
  slug: id,
  title: `Title ${id}`,
  href: `/${id}.html`,
});

describe('discovery resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides rails with fewer than 3 resolved items', async () => {
    (resolveInCatalog as jest.Mock).mockResolvedValue([movie('1'), movie('2')]);
    expect(await resolveRailItems([{ nameRu: 'A Film' }])).toEqual([]);
    expect(keepCatalogRail([movie('1'), movie('2')])).toEqual([]);
  });

  it('keeps rails with 3+ items', async () => {
    const items = [movie('1'), movie('2'), movie('3')];
    (resolveInCatalog as jest.Mock).mockResolvedValue(items);
    expect(await resolveRailItems([{ nameRu: 'A Film' }], 16)).toEqual(items);
    expect(keepCatalogRail(items)).toEqual(items);
  });
});
