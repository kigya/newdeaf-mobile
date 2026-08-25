import { tmdbFetch } from './client';
import { scoreMatch, type TmdbSearchResult } from './match';
import { tmdbImageUrl, type TmdbCastMember, type TmdbExtras, type TmdbVideo } from './types';

type SearchResponse = { results?: TmdbSearchResult[] };
type ImagesResponse = {
  backdrops?: { file_path?: string }[];
  stills?: { file_path?: string }[];
};
type VideosResponse = {
  results?: { key?: string; name?: string; type?: string; site?: string }[];
};
type CreditsResponse = {
  cast?: { name?: string; character?: string; profile_path?: string; order?: number }[];
};

const extrasCache = new Map<string, TmdbExtras | null>();

function trimOrUndef(value?: string): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : undefined;
}

async function resolveTmdbId(input: {
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
}): Promise<{ id: number; mediaType: 'movie' | 'tv' } | null> {
  const query = (input.originalTitle || input.title).trim();
  if (query.length < 2) return null;
  const multi = await tmdbFetch<SearchResponse>(
    `/search/multi?query=${encodeURIComponent(query)}&include_adult=false`
  );
  const results = multi.results;
  if (!results) return null;
  let best: TmdbSearchResult | null = null;
  let bestScore = -1;
  for (const r of results) {
    const mediaType = r.media_type;
    if (mediaType !== 'movie' && mediaType !== 'tv') continue;
    if (input.isSeries && mediaType === 'movie') continue;
    const score = scoreMatch(r, query, input.year);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best || bestScore < 40) return null;
  return { id: best.id, mediaType: best.media_type === 'tv' ? 'tv' : 'movie' };
}

export async function fetchTmdbExtras(input: {
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
}): Promise<TmdbExtras | null> {
  const cacheKey = `${input.tmdbId ?? input.title}|${input.year ?? ''}`;
  if (extrasCache.has(cacheKey)) {
    return extrasCache.get(cacheKey) as TmdbExtras | null;
  }
  try {
    const resolved = input.tmdbId
      ? { id: input.tmdbId, mediaType: input.mediaType ?? (input.isSeries ? 'tv' : 'movie') }
      : await resolveTmdbId(input);
    if (!resolved) {
      extrasCache.set(cacheKey, null);
      return null;
    }
    const { id, mediaType } = resolved;
    const [images, videos, credits] = await Promise.all([
      tmdbFetch<ImagesResponse>(`/${mediaType}/${id}/images`).catch((): ImagesResponse => ({})),
      tmdbFetch<VideosResponse>(`/${mediaType}/${id}/videos`).catch(() => ({ results: [] })),
      tmdbFetch<CreditsResponse>(`/${mediaType}/${id}/credits`).catch(() => ({ cast: [] })),
    ]);
    const stills: string[] = [];
    for (const img of [...(images.backdrops ?? []), ...(images.stills ?? [])]) {
      const url = tmdbImageUrl(img.file_path, 'w780');
      if (url) stills.push(url);
      if (stills.length >= 12) break;
    }
    const videoList: TmdbVideo[] = [];
    for (const v of videos.results ?? []) {
      if (!v.key || (v.site && v.site !== 'YouTube')) continue;
      videoList.push({
        key: v.key,
        name: v.name || 'Trailer',
        type: v.type || 'Trailer',
        site: v.site || 'YouTube',
      });
      if (videoList.length >= 6) break;
    }
    const cast: TmdbCastMember[] = (credits.cast ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .slice(0, 16)
      .map((c) => ({
        name: (c.name || '').trim(),
        character: trimOrUndef(c.character),
        profileUrl: tmdbImageUrl(c.profile_path, 'w185'),
      }))
      .filter((c) => c.name);
    const extras: TmdbExtras = {
      tmdbId: id,
      mediaType,
      backdropUrl: tmdbImageUrl(images.backdrops?.[0]?.file_path, 'w1280'),
      stills,
      videos: videoList,
      cast,
    };
    extrasCache.set(cacheKey, extras);
    return extras;
  } catch {
    return null;
  }
}

export function pickTmdbTrailerKey(extras: TmdbExtras | null): string | undefined {
  if (!extras?.videos.length) return undefined;
  const trailer =
    extras.videos.find((v) => /trailer/i.test(v.type)) ??
    extras.videos.find((v) => v.site === 'YouTube') ??
    extras.videos[0];
  return trailer?.key;
}
