import { create } from 'zustand';

import type { MovieSummary } from '@/src/data/catalog/types';
import {
  deleteListItemRow,
  deleteListRow,
  insertList,
  listAllItems,
  listLists,
  renameListRow,
  upsertListItem,
} from './db';
import type { ListItemRecord, ListRecord } from './types';

type ListsState = {
  lists: ListRecord[];
  items: ListItemRecord[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  itemsFor: (listId: string) => ListItemRecord[];
  isInList: (listId: string, movieId: string) => boolean;
  addItem: (listId: string, movie: MovieSummary) => Promise<void>;
  removeItem: (listId: string, movieId: string) => Promise<void>;
  toggleItem: (listId: string, movie: MovieSummary) => Promise<boolean>;
  createList: (name: string) => Promise<ListRecord>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
};

const inFlight = new Set<string>();
let mutationGeneration = 0;

function itemKey(listId: string, movieId: string): string {
  return `${listId}::${movieId}`;
}

function newListId(): string {
  return `list_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useListsStore = create<ListsState>((set, get) => ({
  lists: [],
  items: [],
  hydrated: false,

  hydrate: async () => {
    const gen = mutationGeneration;
    const [lists, items] = await Promise.all([listLists(), listAllItems()]);
    if (gen !== mutationGeneration) {
      const [lists2, items2] = await Promise.all([listLists(), listAllItems()]);
      set({ lists: lists2, items: items2, hydrated: true });
      return;
    }
    set({ lists, items, hydrated: true });
  },

  itemsFor: (listId) => get().items.filter((item) => item.listId === listId),

  isInList: (listId, movieId) =>
    get().items.some((item) => item.listId === listId && item.id === movieId),

  addItem: async (listId, movie) => {
    const key = itemKey(listId, movie.id);
    if (inFlight.has(key)) return;
    inFlight.add(key);
    mutationGeneration += 1;
    try {
      if (get().isInList(listId, movie.id)) return;
      const record: ListItemRecord = {
        listId,
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
      await upsertListItem(record);
      set({ items: [record, ...get().items.filter((i) => !(i.listId === listId && i.id === movie.id))] });
    } finally {
      inFlight.delete(key);
    }
  },

  removeItem: async (listId, movieId) => {
    mutationGeneration += 1;
    await deleteListItemRow(listId, movieId);
    set({
      items: get().items.filter((item) => !(item.listId === listId && item.id === movieId)),
    });
  },

  toggleItem: async (listId, movie) => {
    if (get().isInList(listId, movie.id)) {
      await get().removeItem(listId, movie.id);
      return false;
    }
    await get().addItem(listId, movie);
    return true;
  },

  createList: async (name) => {
    mutationGeneration += 1;
    const trimmed = name.trim();
    const record: ListRecord = {
      id: newListId(),
      name: trimmed.length ? trimmed : 'List',
      kind: 'custom',
      createdAt: Date.now(),
      sortIndex: get().lists.length + 10,
    };
    await insertList(record);
    set({ lists: [...get().lists, record] });
    return record;
  },

  renameList: async (id, name) => {
    const list = get().lists.find((l) => l.id === id);
    if (!list || list.kind !== 'custom') return;
    mutationGeneration += 1;
    const trimmed = name.trim();
    if (!trimmed) return;
    await renameListRow(id, trimmed);
    set({
      lists: get().lists.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
    });
  },

  deleteList: async (id) => {
    const list = get().lists.find((l) => l.id === id);
    if (!list || list.kind !== 'custom') return;
    mutationGeneration += 1;
    await deleteListRow(id);
    set({
      lists: get().lists.filter((l) => l.id !== id),
      items: get().items.filter((i) => i.listId !== id),
    });
  },
}));
