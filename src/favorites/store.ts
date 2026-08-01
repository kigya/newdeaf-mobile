import { create } from 'zustand';

import type { MovieSummary } from '@/src/api/types';
import { deleteFavoriteRow, listFavorites, upsertFavorite } from './db';
import type { FavoriteRecord } from './types';

type FavoritesState = {
  items: FavoriteRecord[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isFavorite: (id: string) => boolean;
  toggle: (movie: MovieSummary) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
};

const inFlight = new Set<string>();
let mutationGeneration = 0;

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    const gen = mutationGeneration;
    const items = await listFavorites();
    if (gen !== mutationGeneration) {
      set({ items: await listFavorites(), hydrated: true });
      return;
    }
    set({ items, hydrated: true });
  },

  isFavorite: (id) => get().items.some((item) => item.id === id),

  toggle: async (movie) => {
    if (inFlight.has(movie.id)) {
      return get().isFavorite(movie.id);
    }
    inFlight.add(movie.id);
    mutationGeneration += 1;
    try {
      const existing = get().items.find((item) => item.id === movie.id);
      if (existing) {
        await deleteFavoriteRow(movie.id);
        set({ items: get().items.filter((item) => item.id !== movie.id) });
        return false;
      }

      const record: FavoriteRecord = {
        id: movie.id,
        slug: movie.slug || movie.id,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.posterUrl,
        href: movie.href || `/${movie.id}.html`,
        kpRating: movie.kpRating,
        imdbRating: movie.imdbRating,
        isSeries: movie.isSeries,
        createdAt: Date.now(),
      };
      await upsertFavorite(record);
      set({ items: [record, ...get().items.filter((item) => item.id !== movie.id)] });
      return true;
    } finally {
      inFlight.delete(movie.id);
    }
  },

  remove: async (id) => {
    mutationGeneration += 1;
    await deleteFavoriteRow(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));
