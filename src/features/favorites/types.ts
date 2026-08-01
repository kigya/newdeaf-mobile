import type { MovieSummary } from '@/src/data/catalog/types';

export type FavoriteRecord = MovieSummary & {
  createdAt: number;
};
