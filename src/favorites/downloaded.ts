import type { DownloadRecord } from '@/src/downloads/types';

/** True if any completed download belongs to this catalog movie (incl. episode ids). */
export function isMovieDownloaded(movieId: string, downloads: DownloadRecord[]): boolean {
  return downloads.some((d) => {
    if (d.status !== 'completed') return false;
    return d.movieId === movieId || d.movieId.startsWith(`${movieId}_s`);
  });
}
