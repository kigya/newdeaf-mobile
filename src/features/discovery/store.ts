import { create } from 'zustand';

import {
  fetchGenreMovies,
  fetchHomeMovies,
  fetchSitePopular,
} from '@/src/data/catalog/catalog';
import { enrichFromKinopoisk, fetchKpCollection, fetchKpPremieres, fetchKpTop } from '@/src/data/catalog/kinopoisk';
import { fetchTmdbTrending } from '@/src/data/catalog/tmdb';
import type { MovieSummary } from '@/src/data/catalog/types';
import { useWatchHistoryStore } from '@/src/features/watch-history/store';

import { listDiscoveryRails, upsertDiscoveryRail } from './db';
import { pickRandomCatalogMovie } from './random';
import { keepCatalogRail, resolveRailItems } from './resolve';
import {
  DISCOVERY_RAIL_IDS,
  isRailStale,
  type DiscoveryRailId,
  type DiscoveryRailRecord,
} from './types';

type RailsMap = Partial<Record<DiscoveryRailId, DiscoveryRailRecord>>;

type DiscoveryState = {
  rails: RailsMap;
  hydrated: boolean;
  refreshing: boolean;
  hydrate: () => Promise<void>;
  refreshStale: () => Promise<void>;
  refreshRail: (railId: DiscoveryRailId) => Promise<void>;
  visibleItems: (railId: DiscoveryRailId) => MovieSummary[];
  pickRandom: () => Promise<MovieSummary | undefined>;
};

let mutationGeneration = 0;

async function loadBecauseYouWatched(): Promise<MovieSummary[]> {
  const hist = useWatchHistoryStore.getState();
  if (!hist.hydrated && hist.hydrate) {
    await hist.hydrate();
  }
  const history = useWatchHistoryStore.getState().items;
  const seed = history.find((h) => h.title.trim().length >= 2);
  if (!seed) return [];
  const kp = await enrichFromKinopoisk({
    newdeafId: seed.movieId,
    title: seed.title,
    year: undefined,
    isSeries: seed.isSeries,
  });
  return keepCatalogRail(kp?.similar ?? []);
}

async function fetchRailItems(railId: DiscoveryRailId): Promise<MovieSummary[]> {
  switch (railId) {
    case 'site-popular':
      return keepCatalogRail(await fetchSitePopular());
    case 'because-you-watched':
      return loadBecauseYouWatched();
    case 'kp-top-250':
      return resolveRailItems(await fetchKpCollection('TOP_250_MOVIES'));
    case 'kp-premieres': {
      const premieres = await fetchKpPremieres();
      const resolved = await resolveRailItems(premieres);
      if (resolved.length) return resolved;
      return resolveRailItems(await fetchKpTop('TOP_AWAIT_FILMS'));
    }
    case 'tmdb-trending': {
      const trending = await fetchTmdbTrending();
      return resolveRailItems(
        trending.map((item) => ({
          nameRu: item.title,
          nameOriginal: item.originalTitle,
          year: item.year,
        }))
      );
    }
    case 'genre-fantastic':
      return keepCatalogRail((await fetchGenreMovies('/fantastic/')).items);
    case 'genre-serials':
      return keepCatalogRail((await fetchGenreMovies('/serialy/')).items);
    default: {
      const _exhaustive: never = railId;
      return _exhaustive;
    }
  }
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  rails: {},
  hydrated: false,
  refreshing: false,

  hydrate: async () => {
    const gen = mutationGeneration;
    const rows = await listDiscoveryRails();
    const rails: RailsMap = {};
    for (const row of rows) {
      rails[row.railId] = row;
    }
    if (gen !== mutationGeneration) {
      const fresh = await listDiscoveryRails();
      const next: RailsMap = {};
      for (const row of fresh) next[row.railId] = row;
      set({ rails: next, hydrated: true });
      return;
    }
    set({ rails, hydrated: true });
  },

  visibleItems: (railId) => get().rails[railId]?.items ?? [],

  refreshRail: async (railId) => {
    mutationGeneration += 1;
    try {
      const items = await fetchRailItems(railId);
      const record: DiscoveryRailRecord = {
        railId,
        items,
        updatedAt: Date.now(),
      };
      await upsertDiscoveryRail(record);
      set({ rails: { ...get().rails, [railId]: record } });
    } catch {
      const prev = get().rails[railId];
      if (!prev) {
        set({
          rails: {
            ...get().rails,
            [railId]: { railId, items: [], updatedAt: Date.now() },
          },
        });
      }
    }
  },

  refreshStale: async () => {
    set({ refreshing: true });
    try {
      const now = Date.now();
      for (const railId of DISCOVERY_RAIL_IDS) {
        const current = get().rails[railId];
        if (current && !isRailStale(current.updatedAt, now) && current.items.length) {
          continue;
        }
        await get().refreshRail(railId);
      }
    } finally {
      set({ refreshing: false });
    }
  },

  pickRandom: () => pickRandomCatalogMovie(fetchHomeMovies),
}));
