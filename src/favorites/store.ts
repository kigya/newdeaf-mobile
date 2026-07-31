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

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    const items = await listFavorites();
    set({ items, hydrated: true });
  },

  isFavorite: (id) => get().items.some((item) => item.id === id),

  toggle: async (movie) => {
    if (inFlight.has(movie.id)) {
      return get().isFavorite(movie.id);
    }
    inFlight.add(movie.id);
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
    await deleteFavoriteRow(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));
