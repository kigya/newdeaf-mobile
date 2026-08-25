import { useEffect, useState } from 'react';

import { fetchKinopoiskExtras, type KinopoiskExtras } from '@/src/data/catalog/kinopoisk';
import { fetchTmdbExtras, type TmdbExtras } from '@/src/data/catalog/tmdb';
import type { MovieDetail } from '@/src/data/catalog/types';

export function applyUnlessCancelled<T>(
  cancelled: boolean,
  value: T,
  apply: (value: T) => void
): void {
  if (!cancelled) apply(value);
}

export function useMovieDetailExtras(movie: MovieDetail | null, kinopoiskId?: number) {
  const [kpExtras, setKpExtras] = useState<KinopoiskExtras | null>(null);
  const [tmdbExtras, setTmdbExtras] = useState<TmdbExtras | null>(null);

  useEffect(() => {
    if (!movie) {
      setKpExtras(null);
      setTmdbExtras(null);
      return;
    }
    let cancelled = false;
    void (typeof fetchKinopoiskExtras === 'function'
      ? fetchKinopoiskExtras({
          kinopoiskId,
          title: movie.title,
          originalTitle: movie.originalTitle,
          year: movie.year,
          isSeries: movie.isSeries,
        })
      : Promise.resolve(null)
    )
      .then((data) => {
        applyUnlessCancelled(cancelled, data, setKpExtras);
      })
      .catch(() => {
        applyUnlessCancelled(cancelled, null, setKpExtras);
      });
    void (typeof fetchTmdbExtras === 'function'
      ? fetchTmdbExtras({
          title: movie.title,
          originalTitle: movie.originalTitle,
          year: movie.year,
          isSeries: movie.isSeries,
        })
      : Promise.resolve(null)
    )
      .then((data) => {
        applyUnlessCancelled(cancelled, data, setTmdbExtras);
      })
      .catch(() => {
        applyUnlessCancelled(cancelled, null, setTmdbExtras);
      });
    return () => {
      cancelled = true;
    };
  }, [movie?.id, movie?.title, movie?.originalTitle, movie?.year, movie?.isSeries, kinopoiskId]);

  return { kpExtras, tmdbExtras };
}
