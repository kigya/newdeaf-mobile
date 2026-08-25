import { stripTags } from '@/src/data/catalog/client';
import { resolveInCatalog } from '@/src/data/catalog/resolveInCatalog';

import { formatAgeRating } from './ageRating';
import { getKinopoiskApiKey, kpFetch } from './client';
import { resolveKinopoiskId } from './match';
import type {
  KinopoiskExtras,
  KinopoiskImage,
  KinopoiskReview,
  KinopoiskSeasonInfo,
  KinopoiskYoutubeVideo,
} from './types';

const extrasCache = new Map<number, KinopoiskExtras>();

function youtubeIdFromUrl(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{6,})/) ??
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/embed\/([\w-]{6,})/);
  return m?.[1] ?? null;
}

type FilmDetail = {
  slogan?: string | null;
  ratingAgeLimits?: string | null;
  filmLength?: number | null;
  countries?: { country?: string }[];
};

type ImagesResponse = { items?: { imageUrl?: string; previewUrl?: string }[] };
type VideosResponse = { items?: { url?: string; name?: string; site?: string }[] };
type ReviewsResponse = {
  items?: {
    kinopoiskId?: number;
    reviewId?: number;
    type?: string;
    title?: string;
    description?: string;
    author?: string;
  }[];
  reviews?: {
    reviewId?: number;
    type?: string;
    title?: string;
    description?: string;
    authorInfo?: { name?: string };
  }[];
};
type SeasonsResponse = {
  items?: { number?: number; episodes?: unknown[] }[];
};
type SequelItem = {
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: number | string | null;
  posterUrl?: string | null;
  relationType?: string;
};

function takeImages(raw: ImagesResponse): KinopoiskImage[] {
  const out: KinopoiskImage[] = [];
  for (const item of raw.items ?? []) {
    if (!item.imageUrl) continue;
    out.push({ imageUrl: item.imageUrl, previewUrl: item.previewUrl });
    if (out.length >= 12) break;
  }
  return out;
}

function takeVideos(raw: VideosResponse): KinopoiskYoutubeVideo[] {
  const out: KinopoiskYoutubeVideo[] = [];
  const items = raw.items;
  if (!items) return out;
  for (const item of items) {
    const url = item.url?.trim();
    if (!url) continue;
    const youtubeId = youtubeIdFromUrl(url);
    if (!youtubeId) continue;
    out.push({
      url,
      name: item.name?.trim() || 'Trailer',
      youtubeId,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function takeReviews(raw: ReviewsResponse): KinopoiskReview[] {
  const list = raw.items ?? raw.reviews;
  const out: KinopoiskReview[] = [];
  if (!list) return out;
  for (const item of list) {
    const description = stripTags(item.description || '').trim();
    if (!description) continue;
    out.push({
      reviewId: Number(
        ('reviewId' in item && item.reviewId) ||
          ('kinopoiskId' in item && item.kinopoiskId) ||
          out.length
      ),
      type: item.type || 'UNKNOWN',
      title: item.title?.trim() || undefined,
      author:
        ('author' in item ? item.author : undefined) ||
        ('authorInfo' in item ? item.authorInfo?.name : undefined) ||
        undefined,
      description: description.slice(0, 1200),
    });
    if (out.length >= 3) break;
  }
  return out;
}

function takeSeasons(raw: SeasonsResponse): KinopoiskSeasonInfo[] {
  const out: KinopoiskSeasonInfo[] = [];
  for (const item of raw.items ?? []) {
    const season = Number(item.number);
    if (!Number.isFinite(season) || season <= 0) continue;
    const episodes = Array.isArray(item.episodes) ? item.episodes.length : 0;
    out.push({ season, episodes });
  }
  return out;
}

export async function fetchKinopoiskExtras(input: {
  kinopoiskId?: number;
  title: string;
  originalTitle?: string;
  year?: string;
  isSeries?: boolean;
}): Promise<KinopoiskExtras | null> {
  if (!getKinopoiskApiKey()) return null;
  const kinopoiskId = input.kinopoiskId ?? (await resolveKinopoiskId(input));
  if (!kinopoiskId) return null;
  const cached = extrasCache.get(kinopoiskId);
  if (cached) return cached;

  try {
    const [detail, stills, wallpapers, videos, reviews, seasons, sequels] = await Promise.all([
      kpFetch<FilmDetail>(`/api/v2.2/films/${kinopoiskId}`).catch(() => ({}) as FilmDetail),
      kpFetch<ImagesResponse>(`/api/v2.2/films/${kinopoiskId}/images?type=STILL&page=1`).catch(
        () => ({ items: [] })
      ),
      kpFetch<ImagesResponse>(
        `/api/v2.2/films/${kinopoiskId}/images?type=WALLPAPER&page=1`
      ).catch(() => ({ items: [] })),
      kpFetch<VideosResponse>(`/api/v2.2/films/${kinopoiskId}/videos`).catch(() => ({
        items: [],
      })),
      kpFetch<ReviewsResponse>(
        `/api/v2.2/films/${kinopoiskId}/reviews?page=1&order=USER_POSITIVE_RATING_DESC`
      ).catch(() => ({ items: [] })),
      input.isSeries
        ? kpFetch<SeasonsResponse>(`/api/v2.2/films/${kinopoiskId}/seasons`).catch(() => ({
            items: [],
          }))
        : Promise.resolve({ items: [] }),
      kpFetch<SequelItem[] | { items?: SequelItem[] }>(
        `/api/v2.1/films/${kinopoiskId}/sequels_and_prequels`
      ).catch(() => []),
    ]);

    const images = takeImages(stills).length ? takeImages(stills) : takeImages(wallpapers);
    const sequelStubs = Array.isArray(sequels) ? sequels : sequels.items ?? [];
    const resolvedSequels = await resolveInCatalog(
      sequelStubs.map((s) => ({
        nameRu: s.nameRu,
        nameEn: s.nameEn,
        nameOriginal: s.nameOriginal,
        year: s.year,
        posterUrl: s.posterUrl,
        relationType: s.relationType,
      })),
      8
    );

    const extras: KinopoiskExtras = {
      kinopoiskId,
      slogan: detail.slogan?.trim() || undefined,
      ageRating: formatAgeRating(detail.ratingAgeLimits),
      filmLengthMin:
        typeof detail.filmLength === 'number' && detail.filmLength > 0
          ? detail.filmLength
          : undefined,
      countries: (detail.countries ?? [])
        .map((c) => c.country?.trim())
        .filter((c): c is string => Boolean(c)),
      images,
      youtubeVideos: takeVideos(videos),
      reviews: takeReviews(reviews),
      seasons: takeSeasons(seasons),
      sequels: resolvedSequels,
    };
    extrasCache.set(kinopoiskId, extras);
    return extras;
  } catch {
    return null;
  }
}
