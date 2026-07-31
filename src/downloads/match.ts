import type { DownloadRecord } from '@/src/downloads/types';

/** True if any completed download belongs to this catalog movie (incl. episode ids). */
export function isMovieDownloaded(movieId: string, downloads: DownloadRecord[]): boolean {
  return listCompletedDownloads(movieId, downloads).length > 0;
}

/**
 * Completed non-YouTube downloads for a catalog movie.
 * When season+episode are provided, only that episode's copies are returned.
 */
export function listCompletedDownloads(
  movieId: string,
  downloads: DownloadRecord[],
  season?: number,
  episode?: number
): DownloadRecord[] {
  const episodeMovieId =
    season != null && episode != null ? `${movieId}_s${season}_e${episode}` : null;

  return downloads.filter((d) => {
    if (d.status !== 'completed') return false;
    if (d.source === 'youtube') return false;
    if (!d.playlistPath) return false;

    if (episodeMovieId) {
      return (
        d.movieId === episodeMovieId ||
        (d.movieId === movieId && d.season === season && d.episode === episode) ||
        (d.movieId.startsWith(`${movieId}_s`) &&
          d.season === season &&
          d.episode === episode)
      );
    }

    return d.movieId === movieId || d.movieId.startsWith(`${movieId}_s`);
  });
}
