import type { MovieSummary } from '@/src/api/types';

export type FavoriteRecord = MovieSummary & {
  createdAt: number;
};
