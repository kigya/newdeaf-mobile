import type { MovieSummary } from '@/src/data/catalog/types';

export type KinopoiskFact = {
  text: string;
  type: 'FACT' | 'BLOOPER' | string;
  spoiler: boolean;
};

export type KinopoiskStaffMember = {
  staffId: number;
  nameRu?: string;
  nameEn?: string;
  description?: string;
  posterUrl?: string;
  professionText?: string;
  professionKey?: string;
};

export type KinopoiskAwardChip = {
  name: string;
};

export type KinopoiskRelatedMovie = MovieSummary & {
  relationLabel?: string;
};

export type KinopoiskEnrichment = {
  kinopoiskId: number;
  facts: KinopoiskFact[];
  staff: KinopoiskStaffMember[];
  awards: KinopoiskAwardChip[];
  similar: KinopoiskRelatedMovie[];
  related: KinopoiskRelatedMovie[];
};

export type KinopoiskReview = {
  reviewId: number;
  type: string;
  title?: string;
  author?: string;
  description: string;
};

export type KinopoiskImage = {
  imageUrl: string;
  previewUrl?: string;
};

export type KinopoiskYoutubeVideo = {
  url: string;
  name: string;
  youtubeId: string;
};

export type KinopoiskSeasonInfo = {
  season: number;
  episodes: number;
};

export type KinopoiskExtras = {
  kinopoiskId: number;
  slogan?: string;
  ageRating?: string;
  filmLengthMin?: number;
  countries: string[];
  images: KinopoiskImage[];
  youtubeVideos: KinopoiskYoutubeVideo[];
  reviews: KinopoiskReview[];
  seasons: KinopoiskSeasonInfo[];
  sequels: KinopoiskRelatedMovie[];
};

export type KpCollectionType =
  | 'TOP_250_MOVIES'
  | 'TOP_POPULAR_MOVIES'
  | 'TOP_POPULAR_ALL'
  | 'TOP_250_TV_SHOWS'
  | 'POPULAR_SERIES'
  | 'CLOSES_RELEASES';

export type KpCollectionStub = {
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: string | number | null;
  posterUrl?: string | null;
};
