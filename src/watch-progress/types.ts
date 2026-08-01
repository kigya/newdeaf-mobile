export type WatchProgressSource = 'online' | 'offline';

export type WatchProgressRecord = {
  id: string;
  movieId: string;
  season?: number;
  episode?: number;
  positionSec: number;
  durationSec?: number;
  title: string;
  posterUrl?: string;
  href?: string;
  isSeries: boolean;
  source: WatchProgressSource;
  downloadId?: string;
  updatedAt: number;
};

export type WatchProgressUpsert = {
  movieId: string;
  season?: number;
  episode?: number;
  positionSec: number;
  durationSec?: number;
  title: string;
  posterUrl?: string;
  href?: string;
  isSeries?: boolean;
  source: WatchProgressSource;
  downloadId?: string;
  /**
   * Optional client generation for racing async writes.
   * Higher generation always wins; same/missing falls through to normal upsert.
   */
  saveGeneration?: number;
};

/** Min position to offer resume (seconds). */
export const RESUME_MIN_POSITION_SEC = 30;

/** Treat as finished when this fraction of duration is watched. */
export const RESUME_COMPLETE_RATIO = 0.9;

/** Treat as finished when remaining time is below this (seconds). */
export const RESUME_COMPLETE_REMAINING_SEC = 120;

/**
 * Only apply the “near end” remaining-time rule when duration looks like a
 * real feature-length title. Short/wrong WebView durations otherwise wipe
 * mid-watch progress (e.g. duration≈buffer length).
 */
export const RESUME_COMPLETE_MIN_DURATION_SEC = 15 * 60;

/** Reject incomplete HTML5 duration metadata near current position. */
export const DURATION_METADATA_SLACK_SEC = 5;

export function makeProgressId(
  movieId: string,
  season?: number,
  episode?: number
): string {
  if (season != null && episode != null) {
    return `${movieId}_s${season}e${episode}`;
  }
  return movieId;
}

/**
 * Downloads store serial episode keys as `${catalogId}_s{N}_e{M}` in movieId.
 * Watch progress always keys by catalog movie id + season/episode fields.
 */
export function catalogMovieIdFromDownloadMovieId(
  downloadMovieId: string,
  season?: number,
  episode?: number
): string {
  if (season != null && episode != null) {
    const suffix = `_s${season}_e${episode}`;
    if (downloadMovieId.endsWith(suffix)) {
      return downloadMovieId.slice(0, -suffix.length);
    }
  }
  return downloadMovieId;
}

export function formatWatchTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isResumable(record: WatchProgressRecord | null | undefined): boolean {
  if (!record) return false;
  if (record.positionSec < RESUME_MIN_POSITION_SEC) return false;
  if (isWatchCompleted(record)) return false;
  return true;
}

export function isWatchCompleted(record: {
  positionSec: number;
  durationSec?: number;
}): boolean {
  const duration = record.durationSec;
  if (duration == null || duration <= 0 || !Number.isFinite(duration)) return false;
  if (record.positionSec / duration >= RESUME_COMPLETE_RATIO) return true;
  if (
    duration >= RESUME_COMPLETE_MIN_DURATION_SEC &&
    duration - record.positionSec < RESUME_COMPLETE_REMAINING_SEC
  ) {
    return true;
  }
  return false;
}

/** Drop incomplete / suspicious duration values from the player before upsert. */
export function sanitizeDurationSec(
  positionSec: number,
  durationSec?: number
): number | undefined {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return undefined;
  }
  if (durationSec <= positionSec + DURATION_METADATA_SLACK_SEC) {
    return undefined;
  }
  if (durationSec < RESUME_MIN_POSITION_SEC * 10) {
    return undefined;
  }
  return durationSec;
}
