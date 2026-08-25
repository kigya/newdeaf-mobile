import {
  DISCOVERY_RAIL_IDS,
  isRailStale,
  RAIL_TTL_MS,
  shouldHideRail,
} from '@/src/features/discovery/types';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie = (id: string): MovieSummary => ({
  id,
  slug: id,
  title: `T${id}`,
  href: `/${id}.html`,
});

describe('discovery types', () => {
  it('isRailStale uses the 24h TTL', () => {
    const now = 1_000_000;
    expect(isRailStale(now, now)).toBe(false);
    expect(isRailStale(now - RAIL_TTL_MS + 1, now)).toBe(false);
    expect(isRailStale(now - RAIL_TTL_MS, now)).toBe(true);
    expect(isRailStale(0)).toBe(true);
  });

  it('shouldHideRail when fewer than 3 items', () => {
    expect(shouldHideRail([])).toBe(true);
    expect(shouldHideRail([movie('1'), movie('2')])).toBe(true);
    expect(shouldHideRail([movie('1'), movie('2'), movie('3')])).toBe(false);
    expect(DISCOVERY_RAIL_IDS).toHaveLength(7);
  });
});
