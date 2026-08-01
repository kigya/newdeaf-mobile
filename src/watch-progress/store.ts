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
  /** Highest saveGeneration accepted per progress id (in-memory only). */
  saveGenerations: Record<string, number>;
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

let mutationGeneration = 0;

export const useWatchProgressStore = create<WatchProgressState>((set, get) => ({
  items: [],
  hydrated: false,
  saveGenerations: {},

  hydrate: async () => {
    const gen = mutationGeneration;
    const items = await listWatchProgress();
    if (gen !== mutationGeneration) {
      set({ items: await listWatchProgress(), hydrated: true });
      return;
    }
    set({ items, hydrated: true });
  },

  get: (movieId, season, episode) => {
    const id = makeProgressId(movieId, season, episode);
    return get().items.find((item) => item.id === id);
  },

  getLatestForMovie: (movieId) =>
    get().items.find((item) => item.movieId === movieId),

  upsert: async (input) => {
    mutationGeneration += 1;
    const id = makeProgressId(input.movieId, input.season, input.episode);
    const gen = input.saveGeneration;
    if (gen != null) {
      const prev = get().saveGenerations[id] ?? 0;
      if (gen < prev) {
        // Stale async write — do not overwrite a newer in-session save.
        return get().items.find((item) => item.id === id) ?? null;
      }
      set({ saveGenerations: { ...get().saveGenerations, [id]: gen } });
    }

    const { saveGeneration: _gen, ...persist } = input;

    if (isWatchCompleted(persist)) {
      await deleteWatchProgress(id);
      const nextGens = { ...get().saveGenerations };
      delete nextGens[id];
      set({
        items: get().items.filter((item) => item.id !== id),
        saveGenerations: nextGens,
      });
      return null;
    }

    const record = await upsertWatchProgress(persist);
    // Re-check generation after await — a newer save may have started.
    if (gen != null) {
      const latest = get().saveGenerations[id] ?? 0;
      if (gen < latest) {
        return get().items.find((item) => item.id === id) ?? record;
      }
    }
    set({ items: replaceItem(get().items, record) });
    return record;
  },

  clear: async (movieId, season, episode) => {
    mutationGeneration += 1;
    const id = makeProgressId(movieId, season, episode);
    await deleteWatchProgressForEpisode(movieId, season, episode);
    const nextGens = { ...get().saveGenerations };
    delete nextGens[id];
    set({
      items: get().items.filter((item) => item.id !== id),
      saveGenerations: nextGens,
    });
  },

  clearById: async (id) => {
    mutationGeneration += 1;
    await deleteWatchProgress(id);
    const nextGens = { ...get().saveGenerations };
    delete nextGens[id];
    set({
      items: get().items.filter((item) => item.id !== id),
      saveGenerations: nextGens,
    });
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
