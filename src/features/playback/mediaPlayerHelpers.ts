/** Pure helpers for MediaPlayer (kept separate for branch coverage focus). */

export function resumePosition(
  preserved: number | null,
  currentTime: unknown
): number {
  if (preserved != null) return preserved;
  return typeof currentTime === 'number' ? currentTime : 0;
}

export function statusErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: string }).message;
    return msg != null && msg !== '' ? String(msg) : fallback;
  }
  return fallback;
}

export function logIfDev(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}

export function warnIfDev(...args: unknown[]): void {
  if (__DEV__) {
    console.warn(...args);
  }
}

/** Returns false when cancelled so callers can early-return. */
export function runUnlessCancelled(cancelled: boolean, fn: () => void): boolean {
  if (cancelled) return false;
  fn();
  return true;
}

export function shouldSkipInitialSeek(done: boolean, initialPositionSec: number): 'skip' | 'mark-done' | 'seek' {
  if (done) return 'skip';
  if (!(initialPositionSec > 0)) return 'mark-done';
  return 'seek';
}

export function clampSeekTarget(target: number, duration: number): number {
  return Math.min(target, Math.max(0, duration - 1));
}

export function trySeekTo(
  target: number,
  getDuration: () => unknown,
  setTime: (t: number) => void
): boolean {
  try {
    const duration = getDuration();
    if (typeof duration === 'number' && duration > 0) {
      setTime(clampSeekTarget(target, duration));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function scheduleSeekRetries(
  trySeek: () => boolean,
  setIntervalFn: typeof setInterval = setInterval,
  setTimeoutFn: typeof setTimeout = setTimeout,
  clearIntervalFn: typeof clearInterval = clearInterval
): { seekInterval: ReturnType<typeof setInterval>; seekTimeout: ReturnType<typeof setTimeout> } {
  const seekInterval = setIntervalFn(() => {
    if (trySeek()) clearIntervalFn(seekInterval);
  }, 200);
  const seekTimeout = setTimeoutFn(() => {
    clearIntervalFn(seekInterval);
  }, 5000);
  return { seekInterval, seekTimeout };
}

export function takePreserveTarget(preserved: number | null): number {
  return preserved ?? 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function applyReadyToPlay(
  wantPlaying: boolean,
  play: () => void,
  clearError: () => void
): void {
  if (!wantPlaying) return;
  clearError();
  try {
    play();
  } catch {
    // ignore
  }
}

export function forceSeekIfNeeded(done: boolean, seek: () => void): boolean {
  if (done) return false;
  try {
    seek();
  } catch {
    // ignore
  }
  return true;
}

export function maybeScheduleSeek(
  target: number,
  trySeek: () => boolean,
  schedule: (ts: () => boolean) => {
    seekInterval: ReturnType<typeof setInterval>;
    seekTimeout: ReturnType<typeof setTimeout>;
  }
): { seekInterval: ReturnType<typeof setInterval>; seekTimeout: ReturnType<typeof setTimeout> } | null {
  if (!(target > 1)) return null;
  if (trySeek()) return null;
  return schedule(trySeek);
}

export function readFiniteTime(getTime: () => unknown): number | null {
  try {
    const time = getTime();
    return isFiniteNumber(time) ? time : null;
  } catch {
    return null;
  }
}

export function shouldApplyParsedSubs(text: string | null, cancelled: boolean): boolean {
  return !!text && !cancelled;
}

/** Invoke fn only when time is a finite number result. */
export function whenFiniteTime(time: number | null, fn: (t: number) => void): void {
  if (time != null) fn(time);
}

export function handlePlayerStatus(
  status: string,
  onError: () => void,
  onReady: () => void
): void {
  if (status === 'error') {
    onError();
    return;
  }
  if (status === 'readyToPlay') {
    onReady();
  }
}

export function runInitialSeekMode(
  mode: 'skip' | 'mark-done' | 'seek',
  onMarkDone: () => void,
  onSeek: () => void
): void {
  if (mode === 'skip') return;
  if (mode === 'mark-done') {
    onMarkDone();
    return;
  }
  onSeek();
}

export function assignSeekHandles<T>(handles: T | null, assign: (h: T) => void): void {
  if (handles) assign(handles);
}
