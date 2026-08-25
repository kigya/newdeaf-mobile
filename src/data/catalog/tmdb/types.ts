export type TmdbCastMember = {
  name: string;
  character?: string;
  profileUrl?: string;
};

export type TmdbVideo = {
  key: string;
  name: string;
  type: string;
  site: string;
};

export type TmdbExtras = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  backdropUrl?: string;
  stills: string[];
  videos: TmdbVideo[];
  cast: TmdbCastMember[];
};

export type TmdbDiscoverItem = {
  title: string;
  originalTitle?: string;
  year?: string;
  posterPath?: string;
  mediaType: 'movie' | 'tv';
};

export const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export function tmdbImageUrl(path: string | undefined, size: string): string | undefined {
  if (!path) return undefined;
  return `${TMDB_IMAGE}/${size}${path}`;
}
