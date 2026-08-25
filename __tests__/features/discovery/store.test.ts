jest.mock('@/src/data/catalog/catalog', () => ({
  fetchGenreMovies: jest.fn(async () => ({ items: [], hasMore: false })),
  fetchHomeMovies: jest.fn(async () => ({ items: [], hasMore: false })),
  fetchSitePopular: jest.fn(async () => []),
}));

jest.mock('@/src/data/catalog/kinopoisk', () => ({
  enrichFromKinopoisk: jest.fn(async () => null),
  fetchKpCollection: jest.fn(async () => []),
  fetchKpPremieres: jest.fn(async () => []),
  fetchKpTop: jest.fn(async () => []),
}));

jest.mock('@/src/data/catalog/tmdb', () => ({
  fetchTmdbTrending: jest.fn(async () => []),
}));

jest.mock('@/src/data/catalog/resolveInCatalog', () => ({
  resolveInCatalog: jest.fn(async () => []),
}));

jest.mock('@/src/features/discovery/db', () => ({
  listDiscoveryRails: jest.fn(async () => []),
  upsertDiscoveryRail: jest.fn(async () => undefined),
}));

jest.mock('@/src/features/watch-history/store', () => ({
  useWatchHistoryStore: {
    getState: jest.fn(() => ({ items: [] })),
  },
}));

import { fetchGenreMovies, fetchHomeMovies, fetchSitePopular } from '@/src/data/catalog/catalog';
import {
  enrichFromKinopoisk,
  fetchKpCollection,
  fetchKpPremieres,
  fetchKpTop,
} from '@/src/data/catalog/kinopoisk';
import { fetchTmdbTrending } from '@/src/data/catalog/tmdb';
import { resolveInCatalog } from '@/src/data/catalog/resolveInCatalog';
import { listDiscoveryRails, upsertDiscoveryRail } from '@/src/features/discovery/db';
import { useDiscoveryStore } from '@/src/features/discovery/store';
import { RAIL_TTL_MS, type DiscoveryRailId } from '@/src/features/discovery/types';
import { useWatchHistoryStore } from '@/src/features/watch-history/store';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie = (id: string): MovieSummary => ({
  id,
  slug: id,
  title: `Title ${id}`,
  href: `/${id}.html`,
});

const three = [movie('1'), movie('2'), movie('3')];

describe('discovery store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiscoveryStore.setState({ rails: {}, hydrated: false, refreshing: false });
    (resolveInCatalog as jest.Mock).mockResolvedValue([]);
    (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({ items: [] });
  });

  it('hydrates rails from db', async () => {
    (listDiscoveryRails as jest.Mock).mockResolvedValue([
      { railId: 'site-popular', items: three, updatedAt: 1 },
    ]);
    await useDiscoveryStore.getState().hydrate();
    expect(useDiscoveryStore.getState().visibleItems('site-popular')).toEqual(three);
    expect(useDiscoveryStore.getState().hydrated).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveList: (v: unknown) => void = () => undefined;
    (listDiscoveryRails as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    (listDiscoveryRails as jest.Mock).mockResolvedValueOnce([
      { railId: 'site-popular', items: [movie('after'), movie('b'), movie('c')], updatedAt: 2 },
    ]);
    (fetchSitePopular as jest.Mock).mockResolvedValue(three);

    const hydratePromise = useDiscoveryStore.getState().hydrate();
    await useDiscoveryStore.getState().refreshRail('site-popular');
    resolveList([{ railId: 'site-popular', items: three, updatedAt: 1 }]);
    await hydratePromise;
    expect(useDiscoveryStore.getState().visibleItems('site-popular')[0]?.id).toBe('after');
  });

  it('refreshRail hides empty results and persists them', async () => {
    (fetchSitePopular as jest.Mock).mockResolvedValue([movie('1')]);
    await useDiscoveryStore.getState().refreshRail('site-popular');
    expect(useDiscoveryStore.getState().visibleItems('site-popular')).toEqual([]);
    expect(upsertDiscoveryRail).toHaveBeenCalledWith(
      expect.objectContaining({ railId: 'site-popular', items: [] })
    );
  });

  it('refreshStale skips a fresh non-empty rail and refreshes the rest', async () => {
    const now = Date.now();
    useDiscoveryStore.setState({
      rails: {
        'site-popular': { railId: 'site-popular', items: three, updatedAt: now },
      },
      hydrated: true,
      refreshing: false,
    });
    (fetchKpCollection as jest.Mock).mockResolvedValue([{ nameRu: 'Top Film Title' }]);
    (fetchKpPremieres as jest.Mock).mockResolvedValue([]);
    (fetchKpTop as jest.Mock).mockResolvedValue([{ nameRu: 'Awaited Film Title' }]);
    (resolveInCatalog as jest.Mock).mockImplementation(async (stubs: { nameRu?: string }[]) =>
      stubs.length ? three : []
    );
    (fetchTmdbTrending as jest.Mock).mockResolvedValue([
      { title: 'Trend', originalTitle: 'Trend', year: '2024' },
    ]);
    (fetchGenreMovies as jest.Mock).mockResolvedValue({ items: three, hasMore: false });
    (fetchSitePopular as jest.Mock).mockResolvedValue(three);

    await useDiscoveryStore.getState().refreshStale();
    expect(fetchSitePopular).not.toHaveBeenCalled();
    expect(fetchKpCollection).toHaveBeenCalledWith('TOP_250_MOVIES');
    expect(fetchKpTop).toHaveBeenCalledWith('TOP_AWAIT_FILMS');
    expect(useDiscoveryStore.getState().refreshing).toBe(false);
  });

  it('loads because-you-watched from history similar titles', async () => {
    (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({
      items: [{ movieId: 's', title: 'Seed Film', isSeries: false }],
    });
    (enrichFromKinopoisk as jest.Mock).mockResolvedValue({ similar: three });
    await useDiscoveryStore.getState().refreshRail('because-you-watched');
    expect(useDiscoveryStore.getState().visibleItems('because-you-watched')).toEqual(three);

    (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({ items: [] });
    await useDiscoveryStore.getState().refreshRail('because-you-watched');
    expect(useDiscoveryStore.getState().visibleItems('because-you-watched')).toEqual([]);

    (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({
      items: [{ movieId: 's', title: 'Seed Film', isSeries: false }],
    });
    (enrichFromKinopoisk as jest.Mock).mockResolvedValue(null);
    await useDiscoveryStore.getState().refreshRail('because-you-watched');
    expect(useDiscoveryStore.getState().visibleItems('because-you-watched')).toEqual([]);
  });

  it('waits for watch-history hydrate before because-you-watched', async () => {
    const hydrate = jest.fn(async () => {
      (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({
        items: [{ movieId: 's', title: 'Seed Film', isSeries: false }],
        hydrated: true,
      });
    });
    (useWatchHistoryStore.getState as jest.Mock).mockReturnValue({
      items: [],
      hydrated: false,
      hydrate,
    });
    (enrichFromKinopoisk as jest.Mock).mockResolvedValue({ similar: three });
    await useDiscoveryStore.getState().refreshRail('because-you-watched');
    expect(hydrate).toHaveBeenCalled();
    expect(useDiscoveryStore.getState().visibleItems('because-you-watched')).toEqual(three);
  });

  it('visibleItems is empty for a rail that was never loaded', () => {
    expect(useDiscoveryStore.getState().visibleItems('tmdb-trending')).toEqual([]);
  });

  it('uses kp premieres when they resolve, otherwise top awaited', async () => {
    (fetchKpPremieres as jest.Mock).mockResolvedValue([{ nameRu: 'Premiere Film Title' }]);
    (resolveInCatalog as jest.Mock).mockResolvedValue(three);
    await useDiscoveryStore.getState().refreshRail('kp-premieres');
    expect(fetchKpTop).not.toHaveBeenCalled();
    expect(useDiscoveryStore.getState().visibleItems('kp-premieres')).toHaveLength(3);
  });

  it('stores an empty rail when fetch throws and nothing was cached', async () => {
    (fetchSitePopular as jest.Mock).mockRejectedValue(new Error('down'));
    await useDiscoveryStore.getState().refreshRail('site-popular');
    expect(useDiscoveryStore.getState().visibleItems('site-popular')).toEqual([]);

    useDiscoveryStore.setState({
      rails: { 'site-popular': { railId: 'site-popular', items: three, updatedAt: 1 } },
      hydrated: true,
      refreshing: false,
    });
    await useDiscoveryStore.getState().refreshRail('site-popular');
    expect(useDiscoveryStore.getState().visibleItems('site-popular')).toEqual(three);
  });

  it('pickRandom delegates to home catalog and covers the exhaustive default', async () => {
    (fetchHomeMovies as jest.Mock).mockResolvedValue({ items: three, hasMore: false });
    const picked = await useDiscoveryStore.getState().pickRandom();
    expect(three.map((m) => m.id)).toContain(picked?.id);

    await useDiscoveryStore.getState().refreshRail('bogus' as DiscoveryRailId);
    expect(upsertDiscoveryRail).toHaveBeenCalled();
  });
});
