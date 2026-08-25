const TMDB_API = 'https://api.themoviedb.org/3';

function tmdbKey(): string {
  return process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
}

function tmdbToken(): string {
  return process.env.EXPO_PUBLIC_TMDB_READ_TOKEN ?? '';
}

export function isTmdbConfigured(): boolean {
  return Boolean(tmdbKey() || tmdbToken());
}

function authHeaders(): Record<string, string> {
  const token = tmdbToken();
  if (token) {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }
  return { Accept: 'application/json' };
}

function withKey(url: string): string {
  if (tmdbToken()) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api_key=${encodeURIComponent(tmdbKey())}`;
}

export async function tmdbFetch<T>(pathAndQuery: string): Promise<T> {
  if (!tmdbKey() && !tmdbToken()) {
    throw new Error('TMDB key missing');
  }
  const res = await fetch(withKey(`${TMDB_API}${pathAndQuery}`), {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`TMDB HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
