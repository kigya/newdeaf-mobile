import type { Dispatch, SetStateAction } from 'react';

import { fetchMovieDetail, fetchPlayerFileList } from '@/src/data/catalog/catalog';
import {
  isResolvableEmbedUrl,
  resolveEmbedStream,
} from '@/src/data/catalog/embedStreams';
import {
  enrichFromKinopoisk,
  type KinopoiskEnrichment,
} from '@/src/data/catalog/kinopoisk';
import { listEpisodes, listSeasons } from '@/src/data/catalog/parse';
import { enrichMovieMetadata } from '@/src/data/catalog/tmdb';
import type { MovieDetail, PlayerFileList, StreamPayload } from '@/src/data/catalog/types';
import { getLocale, t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { fetchLatestProgressForMovie } from '@/src/features/watch-progress/store';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

export type MovieDetailLoadSetters = {
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStream: Dispatch<SetStateAction<StreamPayload | null>>;
  setStreamError: Dispatch<SetStateAction<string | null>>;
  setResolvedPlayerUrl: Dispatch<SetStateAction<string | undefined>>;
  setFileList: Dispatch<SetStateAction<PlayerFileList | null>>;
  setResumePrompt: Dispatch<SetStateAction<WatchProgressRecord | null>>;
  setKp: Dispatch<SetStateAction<KinopoiskEnrichment | null>>;
  setKpLoading: Dispatch<SetStateAction<boolean>>;
  setMovie: Dispatch<SetStateAction<MovieDetail | null>>;
  setSeason: Dispatch<SetStateAction<number>>;
  setEpisode: Dispatch<SetStateAction<number>>;
  setStreamLoading: Dispatch<SetStateAction<boolean>>;
};

/** Same cancelled-flag load effect as the original MovieDetailScreen. */
export function subscribeMovieDetailLoad(
  href: string | undefined,
  id: string,
  paramPoster: string | undefined,
  setters: MovieDetailLoadSetters
): () => void {
  const {
    setLoading,
    setError,
    setStream,
    setStreamError,
    setResolvedPlayerUrl,
    setFileList,
    setResumePrompt,
    setKp,
    setKpLoading,
    setMovie,
    setSeason,
    setEpisode,
    setStreamLoading,
  } = setters;

  let cancelled = false;
  setLoading(true);
  setError(null);
  setStream(null);
  setStreamError(null);
  setResolvedPlayerUrl(undefined);
  setFileList(null);
  setResumePrompt(null);
  setKp(null);
  setKpLoading(false);
  void (async () => {
    try {
      const detail = await fetchMovieDetail(href || id);
      if (cancelled) return;
      const listPoster = paramPoster && paramPoster.length > 0 ? paramPoster : undefined;
      let next: MovieDetail = {
        ...detail,
        posterUrl: detail.posterUrl || listPoster,
      };

      // When UI is English, overlay localized title / plot / cast from TMDB.
      if (getLocale() === 'en') {
        try {
          const enriched = await enrichMovieMetadata({
            title: detail.title,
            originalTitle: detail.originalTitle,
            year: detail.year,
            isSeries: detail.isSeries,
          });
          if (enriched) {
            next = {
              ...next,
              title: enriched.title || next.title,
              description: enriched.overview || next.description,
              actors: enriched.actors.length ? enriched.actors : next.actors,
              director: enriched.director || next.director,
              originalTitle: enriched.originalTitle || next.originalTitle,
            };
          }
        } catch {
          // keep scraped Russian metadata
        }
      }

      if (cancelled) return;
      setMovie(next);
      if (detail.season) setSeason(detail.season);
      if (detail.episode) setEpisode(detail.episode);
      // Show detail immediately — embed/fsst resolve can take tens of seconds on
      // devices where OkHttp hangs and Chrome iframe XHR is the fallback.
      setLoading(false);

      setKpLoading(true);
      void enrichFromKinopoisk(
        {
          newdeafId: next.id,
          title: next.title,
          originalTitle: next.originalTitle,
          year: next.year,
          isSeries: next.isSeries,
        },
        (partial) => {
          if (!cancelled) {
            setKp(partial);
            setKpLoading(false);
          }
        }
      )
        .then((enrichment) => {
          if (!cancelled) setKp(enrichment);
        })
        .catch(() => {
          // partial may already be shown
        })
        .finally(() => {
          if (!cancelled) setKpLoading(false);
        });

      if (detail.playerUrl) {
        if (detail.nativePlayer !== false) {
          setStreamLoading(true);
          try {
            const fl = await fetchPlayerFileList(detail.playerUrl);
            if (!cancelled && fl) {
              setFileList(fl);
              if (fl.type === 'serial') {
                const seasons = listSeasons(fl);
                const latest = await fetchLatestProgressForMovie(detail.id);
                if (
                  latest?.season != null &&
                  latest.episode != null &&
                  seasons.includes(latest.season) &&
                  listEpisodes(fl, latest.season).includes(latest.episode)
                ) {
                  setSeason(latest.season);
                  setEpisode(latest.episode);
                } else {
                  const s = fl.active?.seasons ?? seasons[0] ?? 1;
                  const eps = listEpisodes(fl, s);
                  const e = fl.active?.episode ?? eps[0] ?? 1;
                  setSeason(s);
                  setEpisode(e);
                }
              }
            }
          } finally {
            if (!cancelled) {
              const embedFallback =
                detail.fallbackPlayerUrl && isResolvableEmbedUrl(detail.fallbackPlayerUrl);
              if (!embedFallback) setStreamLoading(false);
            }
          }
        } else {
          const candidates = [...new Set(
            [detail.playerUrl, detail.fallbackPlayerUrl].filter(
              (u): u is string => typeof u === 'string' && u.length > 0 && isResolvableEmbedUrl(u)
            )
          )];
          if (candidates.length > 0) {
            setStreamLoading(true);
            setStreamError(null);
            try {
              let embed: StreamPayload | null = null;
              let wonUrl: string | undefined;
              for (const url of candidates) {
                embed = await resolveEmbedStream(url);
                /* istanbul ignore next -- unmount during embed resolve */
                if (cancelled) return;
                if (embed?.hlsSource?.length) {
                  wonUrl = url;
                  break;
                }
              }
              /* istanbul ignore next -- unmount during embed resolve */
              if (cancelled) return;
              if (embed?.hlsSource?.length && wonUrl) {
                setStream(embed);
                setResolvedPlayerUrl(wonUrl);
                setStreamError(null);
                if (embed.hlsSource[0]?.season != null) {
                  setSeason(embed.hlsSource[0].season);
                }
                if (embed.hlsSource[0]?.episode != null) {
                  setEpisode(embed.hlsSource[0].episode);
                }
              } else {
                setStreamError(t('movie.tracksUnavailable'));
              }
            } catch {
              /* istanbul ignore next -- unmount during embed resolve */
              if (cancelled) return;
              setStreamError(t('movie.tracksUnavailable'));
            } finally {
              /* istanbul ignore next -- unmount during embed resolve */
              if (!cancelled) setStreamLoading(false);
            }
          } else {
            setStreamLoading(false);
            setStreamError(t('movie.tracksUnavailable'));
          }
        }
      }
    } catch (e) {
      if (!cancelled) setError(errorMessage(e, t('common.loadingError')));
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();
  return () => {
    cancelled = true;
  };
}
