import { computeStats, formatHoursWatched } from '@/src/features/stats/computeStats';
import type { WatchHistoryRecord } from '@/src/features/watch-history/types';

function row(overrides: Partial<WatchHistoryRecord> = {}): WatchHistoryRecord {
  return {
    id: '1',
    movieId: '1',
    title: 'A',
    isSeries: false,
    source: 'online',
    positionSec: 60,
    completed: false,
    watchedAt: 1,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('sums watch time and unique completed ids', () => {
    const stats = computeStats({
      history: [
        row({ id: 'a', positionSec: 3600, durationSec: 7200, completed: true }),
        row({ id: 'a', positionSec: 10, completed: true }),
        row({ id: 'b', positionSec: 120, completed: false }),
        row({ id: 'c', positionSec: Number.NaN, durationSec: 100, completed: true }),
        row({ id: 'd', positionSec: 0, durationSec: 50, completed: true }),
      ],
      favoritesCount: -2,
      downloadsBytes: -5,
    });
    expect(stats.favoritesCount).toBe(0);
    expect(stats.downloadsBytes).toBe(0);
    expect(stats.completedCount).toBe(3);
    expect(stats.hoursWatched).toBeGreaterThan(0);
  });

  it('formatHoursWatched covers zero, one decimal, and rounded hours', () => {
    expect(formatHoursWatched(0)).toBe('0');
    expect(formatHoursWatched(-1)).toBe('0');
    expect(formatHoursWatched(Number.NaN)).toBe('0');
    expect(formatHoursWatched(1.4)).toBe('1.4');
    expect(formatHoursWatched(10.4)).toBe('10');
  });
});
