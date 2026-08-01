import {
  catalogMovieIdFromDownloadMovieId,
  DURATION_METADATA_SLACK_SEC,
  formatWatchTime,
  isResumable,
  isWatchCompleted,
  makeProgressId,
  RESUME_COMPLETE_MIN_DURATION_SEC,
  RESUME_COMPLETE_RATIO,
  RESUME_COMPLETE_REMAINING_SEC,
  RESUME_MIN_POSITION_SEC,
  sanitizeDurationSec,
  type WatchProgressRecord,
} from '@/src/watch-progress/types';

function record(
  partial: Partial<WatchProgressRecord> & Pick<WatchProgressRecord, 'positionSec'>
): WatchProgressRecord {
  return {
    id: '1',
    movieId: '1',
    title: 'Test',
    isSeries: false,
    source: 'online',
    updatedAt: 1,
    ...partial,
  };
}

describe('makeProgressId', () => {
  it('uses movieId alone without season/episode', () => {
    expect(makeProgressId('42')).toBe('42');
  });

  it('appends season and episode', () => {
    expect(makeProgressId('42', 1, 3)).toBe('42_s1e3');
  });

  it('requires both season and episode', () => {
    expect(makeProgressId('42', 1)).toBe('42');
    expect(makeProgressId('42', undefined, 3)).toBe('42');
  });
});

describe('catalogMovieIdFromDownloadMovieId', () => {
  it('strips _sN_eM suffix when season/episode match', () => {
    expect(catalogMovieIdFromDownloadMovieId('99_s1_e2', 1, 2)).toBe('99');
  });

  it('returns original when suffix does not match', () => {
    expect(catalogMovieIdFromDownloadMovieId('99_s1_e2', 1, 9)).toBe('99_s1_e2');
  });

  it('returns original without season/episode', () => {
    expect(catalogMovieIdFromDownloadMovieId('99_s1_e2')).toBe('99_s1_e2');
  });
});

describe('formatWatchTime', () => {
  it('formats mm:ss under an hour', () => {
    expect(formatWatchTime(65)).toBe('1:05');
    expect(formatWatchTime(0)).toBe('0:00');
  });

  it('formats h:mm:ss for longer durations', () => {
    expect(formatWatchTime(3661)).toBe('1:01:01');
  });

  it('floors and clamps negative', () => {
    expect(formatWatchTime(-5)).toBe('0:00');
    expect(formatWatchTime(65.9)).toBe('1:05');
  });
});

describe('isWatchCompleted', () => {
  it('returns false without valid duration', () => {
    expect(isWatchCompleted({ positionSec: 100 })).toBe(false);
    expect(isWatchCompleted({ positionSec: 100, durationSec: 0 })).toBe(false);
    expect(isWatchCompleted({ positionSec: 100, durationSec: NaN })).toBe(false);
  });

  it('returns true at complete ratio', () => {
    const duration = 1000;
    expect(
      isWatchCompleted({
        positionSec: duration * RESUME_COMPLETE_RATIO,
        durationSec: duration,
      })
    ).toBe(true);
  });

  it('returns true near end for long titles', () => {
    const duration = RESUME_COMPLETE_MIN_DURATION_SEC;
    expect(
      isWatchCompleted({
        positionSec: duration - RESUME_COMPLETE_REMAINING_SEC + 1,
        durationSec: duration,
      })
    ).toBe(true);
  });

  it('does not apply near-end rule for short durations', () => {
    const duration = RESUME_COMPLETE_MIN_DURATION_SEC - 1;
    // Stay below 90% so only the near-end rule could fire — and it must not.
    const positionSec = Math.floor(duration * 0.5);
    expect(
      isWatchCompleted({
        positionSec,
        durationSec: duration,
      })
    ).toBe(false);
  });
});

describe('isResumable', () => {
  it('false for null/undefined', () => {
    expect(isResumable(null)).toBe(false);
    expect(isResumable(undefined)).toBe(false);
  });

  it('false below min position', () => {
    expect(
      isResumable(record({ positionSec: RESUME_MIN_POSITION_SEC - 1, durationSec: 3600 }))
    ).toBe(false);
  });

  it('true at min position when not completed', () => {
    expect(
      isResumable(record({ positionSec: RESUME_MIN_POSITION_SEC, durationSec: 3600 }))
    ).toBe(true);
  });

  it('false when completed', () => {
    expect(
      isResumable(record({ positionSec: 950, durationSec: 1000 }))
    ).toBe(false);
  });
});

describe('sanitizeDurationSec', () => {
  it('drops missing/invalid', () => {
    expect(sanitizeDurationSec(10)).toBeUndefined();
    expect(sanitizeDurationSec(10, 0)).toBeUndefined();
    expect(sanitizeDurationSec(10, NaN)).toBeUndefined();
  });

  it('drops duration near position (buffer-length false positive)', () => {
    expect(sanitizeDurationSec(100, 100 + DURATION_METADATA_SLACK_SEC)).toBeUndefined();
    // Must also clear the minimum-duration gate (RESUME_MIN_POSITION_SEC * 10).
    const okDuration = Math.max(
      100 + DURATION_METADATA_SLACK_SEC + 1,
      RESUME_MIN_POSITION_SEC * 10
    );
    expect(sanitizeDurationSec(100, okDuration)).toBe(okDuration);
  });

  it('drops very short durations', () => {
    expect(sanitizeDurationSec(10, RESUME_MIN_POSITION_SEC * 10 - 1)).toBeUndefined();
    expect(sanitizeDurationSec(10, RESUME_MIN_POSITION_SEC * 10)).toBe(
      RESUME_MIN_POSITION_SEC * 10
    );
  });
});
