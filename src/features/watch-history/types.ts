import type { WatchProgressSource } from '@/src/features/watch-progress/types';

export type WatchHistoryRecord = {
  id: string;
  movieId: string;
  season?: number;
  episode?: number;
  title: string;
  posterUrl?: string;
  href?: string;
  isSeries: boolean;
  source: WatchProgressSource;
  positionSec: number;
  durationSec?: number;
  completed: boolean;
  watchedAt: number;
};

export type WatchHistoryUpsert = {
  movieId: string;
  season?: number;
  episode?: number;
  title: string;
  posterUrl?: string;
  href?: string;
  isSeries?: boolean;
  source: WatchProgressSource;
  positionSec: number;
  durationSec?: number;
  completed: boolean;
};
