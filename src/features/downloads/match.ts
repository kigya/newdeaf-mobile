import type { DownloadRecord } from '@/src/features/downloads/types';

function norm(label: string): string {
  return label.trim().toLowerCase();
}

/** Existing non-YouTube download with the same movie + audio + subtitle labels. */
export function findExistingSameTracks(
  items: DownloadRecord[],
  movieId: string,
  audioLabel: string,
  subtitleLabel: string
): DownloadRecord | undefined {
  const a = norm(audioLabel);
  const s = norm(subtitleLabel);
  return items.find(
    (i) =>
      i.source !== 'youtube' &&
      i.movieId === movieId &&
      norm(i.audioLabel) === a &&
      norm(i.subtitleLabel) === s &&
      (i.status === 'completed' ||
        i.status === 'queued' ||
        i.status === 'downloading' ||
        i.status === 'resolving' ||
        i.status === 'failed' ||
        i.status === 'paused')
  );
}

/** Any existing non-YouTube download for this movie (any tracks). */
export function findAnyExistingMovie(
  items: DownloadRecord[],
  movieId: string
): DownloadRecord | undefined {
  return items.find(
    (i) =>
      i.source !== 'youtube' &&
      i.movieId === movieId &&
      (i.status === 'completed' ||
        i.status === 'queued' ||
        i.status === 'downloading' ||
        i.status === 'resolving' ||
        i.status === 'failed' ||
        i.status === 'paused')
  );
}

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
