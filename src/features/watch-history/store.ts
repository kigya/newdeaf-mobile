import { create } from 'zustand';

import { deleteWatchHistoryRow, listWatchHistory, upsertWatchHistory } from './db';
import type { WatchHistoryRecord, WatchHistoryUpsert } from './types';

type WatchHistoryState = {
  items: WatchHistoryRecord[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  record: (input: WatchHistoryUpsert) => Promise<WatchHistoryRecord>;
  remove: (id: string) => Promise<void>;
};

let mutationGeneration = 0;

export const useWatchHistoryStore = create<WatchHistoryState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    const gen = mutationGeneration;
    const items = await listWatchHistory();
    if (gen !== mutationGeneration) {
      set({ items: await listWatchHistory(), hydrated: true });
      return;
    }
    set({ items, hydrated: true });
  },

  record: async (input) => {
    mutationGeneration += 1;
    const record = await upsertWatchHistory(input);
    set({
      items: [record, ...get().items.filter((item) => item.id !== record.id)],
    });
    return record;
  },

  remove: async (id) => {
    mutationGeneration += 1;
    await deleteWatchHistoryRow(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));
