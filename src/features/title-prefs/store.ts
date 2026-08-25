import { create } from 'zustand';

import { getTitlePrefs, listTitlePrefs, upsertTitlePrefs } from './db';
import type { TitlePrefsRecord } from './types';

type TitlePrefsState = {
  byId: Record<string, TitlePrefsRecord>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  get: (movieId: string) => TitlePrefsRecord | undefined;
  setTracks: (movieId: string, audioLabel?: string, subtitleLabel?: string) => Promise<void>;
  setIntroSkipSec: (movieId: string, introSkipSec: number) => Promise<void>;
};

let mutationGeneration = 0;

export const useTitlePrefsStore = create<TitlePrefsState>((set, get) => ({
  byId: {},
  hydrated: false,

  hydrate: async () => {
    const gen = mutationGeneration;
    const rows = await listTitlePrefs();
    if (gen !== mutationGeneration) {
      const fresh = await listTitlePrefs();
      set({
        byId: Object.fromEntries(fresh.map((r) => [r.movieId, r])),
        hydrated: true,
      });
      return;
    }
    set({
      byId: Object.fromEntries(rows.map((r) => [r.movieId, r])),
      hydrated: true,
    });
  },

  get: (movieId) => get().byId[movieId],

  setTracks: async (movieId, audioLabel, subtitleLabel) => {
    mutationGeneration += 1;
    const prev = get().byId[movieId];
    const record: TitlePrefsRecord = {
      movieId,
      audioLabel: audioLabel ?? prev?.audioLabel,
      subtitleLabel: subtitleLabel ?? prev?.subtitleLabel,
      introSkipSec: prev?.introSkipSec,
      updatedAt: Date.now(),
    };
    await upsertTitlePrefs(record);
    set({ byId: { ...get().byId, [movieId]: record } });
  },

  setIntroSkipSec: async (movieId, introSkipSec) => {
    mutationGeneration += 1;
    const prev = get().byId[movieId];
    const record: TitlePrefsRecord = {
      movieId,
      audioLabel: prev?.audioLabel,
      subtitleLabel: prev?.subtitleLabel,
      introSkipSec,
      updatedAt: Date.now(),
    };
    await upsertTitlePrefs(record);
    set({ byId: { ...get().byId, [movieId]: record } });
  },
}));
