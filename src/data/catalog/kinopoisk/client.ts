const KP_API = 'https://kinopoiskapiunofficial.tech';
const MAX_PARALLEL = 4;
const RETRY_429 = 2;

let quotaExhausted = false;
let inFlight = 0;
const waiters: Array<() => void> = [];

export class KpHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_PARALLEL) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

export function isKinopoiskConfigured(): boolean {
  return Boolean(getKinopoiskApiKey());
}

export function isKpQuotaExhausted(): boolean {
  return quotaExhausted;
}

export function getKinopoiskApiKey(): string {
  return process.env.EXPO_PUBLIC_KINOPOISK_API_KEY ?? '';
}

export async function kpFetch<T>(pathAndQuery: string): Promise<T> {
  const apiKey = getKinopoiskApiKey();
  if (!apiKey) {
    throw new Error('Kinopoisk key missing');
  }
  if (quotaExhausted) {
    throw new KpHttpError(402, 'Kinopoisk quota exhausted');
  }
  await acquireSlot();
  try {
    let attempt = 0;
    while (true) {
      const res = await fetch(`${KP_API}${pathAndQuery}`, {
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
      });
      if (res.status === 402) {
        quotaExhausted = true;
        throw new KpHttpError(402, `Kinopoisk HTTP 402`);
      }
      if (res.status === 429 && attempt < RETRY_429) {
        attempt += 1;
        await sleep(400 * attempt);
        continue;
      }
      if (!res.ok) {
        throw new KpHttpError(res.status, `Kinopoisk HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    }
  } finally {
    releaseSlot();
  }
}
