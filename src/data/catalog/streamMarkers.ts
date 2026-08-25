const MIN_INTRO_SEC = 10;
const MAX_INTRO_SEC = 600;

function parseClock(value: string): number | undefined {
  const parts = value.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return undefined;
}

/** Parse player skipTime / removeTime (seconds, mm:ss, hh:mm:ss). */
export function parseSkipTimeSec(raw?: string | null): number | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return n;
  }
  return parseClock(trimmed);
}

export const parseRemoveTimeSec = parseSkipTimeSec;

export function isPlausibleIntroSkip(sec: number | undefined): boolean {
  return sec != null && Number.isFinite(sec) && sec >= MIN_INTRO_SEC && sec <= MAX_INTRO_SEC;
}

export function introWindowFromMarkers(
  skipTime?: string | null,
  removeTime?: string | null
): { startSec: number; endSec: number } | undefined {
  const end = parseRemoveTimeSec(removeTime) ?? parseSkipTimeSec(skipTime);
  if (!isPlausibleIntroSkip(end)) return undefined;
  const startRaw = parseSkipTimeSec(skipTime);
  const startSec =
    startRaw != null && startRaw >= 0 && startRaw < (end as number) ? startRaw : 0;
  return { startSec, endSec: end as number };
}
