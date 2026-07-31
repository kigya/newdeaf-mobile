import { create } from 'zustand';

import {
  deleteWatchProgress,
  deleteWatchProgressForEpisode,
  getLatestWatchProgressForMovie,
  getWatchProgress,
  listWatchProgress,
  upsertWatchProgress,
} from './db';
import {
  isWatchCompleted,
  makeProgressId,
  type WatchProgressRecord,
  type WatchProgressUpsert,
} from './types';

type WatchProgressState = {
  items: WatchProgressRecord[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  get: (movieId: string, season?: number, episode?: number) => WatchProgressRecord | undefined;
  getLatestForMovie: (movieId: string) => WatchProgressRecord | undefined;
  upsert: (input: WatchProgressUpsert) => Promise<WatchProgressRecord | null>;
  clear: (movieId: string, season?: number, episode?: number) => Promise<void>;
  clearById: (id: string) => Promise<void>;
};

function replaceItem(
  items: WatchProgressRecord[],
  record: WatchProgressRecord
): WatchProgressRecord[] {
  return [record, ...items.filter((item) => item.id !== record.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}

export const useWatchProgressStore = create<WatchProgressState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    const items = await listWatchProgress();
    set({ items, hydrated: true });
  },

  get: (movieId, season, episode) => {
    const id = makeProgressId(movieId, season, episode);
    return get().items.find((item) => item.id === id);
  },

  getLatestForMovie: (movieId) =>
    get().items.find((item) => item.movieId === movieId),

  upsert: async (input) => {
    if (isWatchCompleted(input)) {
      const id = makeProgressId(input.movieId, input.season, input.episode);
      await deleteWatchProgress(id);
      set({ items: get().items.filter((item) => item.id !== id) });
      return null;
    }

    const record = await upsertWatchProgress(input);
    set({ items: replaceItem(get().items, record) });
    return record;
  },

  clear: async (movieId, season, episode) => {
    const id = makeProgressId(movieId, season, episode);
    await deleteWatchProgressForEpisode(movieId, season, episode);
    set({ items: get().items.filter((item) => item.id !== id) });
  },

  clearById: async (id) => {
    await deleteWatchProgress(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));

/** Read from DB when store may not be hydrated yet (player screens). */
export async function fetchProgress(
  movieId: string,
  season?: number,
  episode?: number
): Promise<WatchProgressRecord | null> {
  return getWatchProgress(movieId, season, episode);
}

export async function fetchLatestProgressForMovie(
  movieId: string
): Promise<WatchProgressRecord | null> {
  return getLatestWatchProgressForMovie(movieId);
}
