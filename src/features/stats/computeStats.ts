import type { WatchHistoryRecord } from '@/src/features/watch-history/types';

export type LibraryStats = {
  hoursWatched: number;
  completedCount: number;
  favoritesCount: number;
  downloadsBytes: number;
};

export function computeStats(input: {
  history: WatchHistoryRecord[];
  favoritesCount: number;
  downloadsBytes: number;
}): LibraryStats {
  let watchedSec = 0;
  let completedCount = 0;
  const seenCompleted = new Set<string>();
  for (const row of input.history) {
    const pos = Number.isFinite(row.positionSec) ? Math.max(0, row.positionSec) : 0;
    const dur =
      row.durationSec != null && Number.isFinite(row.durationSec) && row.durationSec > 0
        ? row.durationSec
        : undefined;
    watchedSec += row.completed && dur != null ? Math.min(pos, dur) || dur : pos;
    if (row.completed && !seenCompleted.has(row.id)) {
      seenCompleted.add(row.id);
      completedCount += 1;
    }
  }
  return {
    hoursWatched: watchedSec / 3600,
    completedCount,
    favoritesCount: Math.max(0, input.favoritesCount),
    downloadsBytes: Math.max(0, input.downloadsBytes),
  };
}

export function formatHoursWatched(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours < 10) return hours.toFixed(1);
  return String(Math.round(hours));
}
