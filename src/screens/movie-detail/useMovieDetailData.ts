import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  isResolvableEmbedUrl,
  resolveEmbedStream,
} from '@/src/data/catalog/embedStreams';
import type { KinopoiskEnrichment } from '@/src/data/catalog/kinopoisk';
import {
  buildPlayerUrl,
  listEpisodes,
  listSeasons,
  pickEpisodeEntry,
} from '@/src/data/catalog/parse';
import type { MovieDetail, PlayerFileList, StreamPayload } from '@/src/data/catalog/types';
import { orderAudioSources } from '@/src/features/downloads/hls';
import { listCompletedDownloads } from '@/src/features/downloads/match';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { useFavoritesStore } from '@/src/features/favorites/store';
import { t } from '@/src/shared/i18n';
import {
  fetchProgress,
  useWatchProgressStore,
} from '@/src/features/watch-progress/store';
import { isResumable, type WatchProgressRecord } from '@/src/features/watch-progress/types';
import { subscribeMovieDetailLoad } from '@/src/screens/movie-detail/loadMovieDetail';

export function useMovieDetailData() {
  const { id, href, title: paramTitle, posterUrl: paramPoster } = useLocalSearchParams<{
    id: string;
    href?: string;
    title?: string;
    posterUrl?: string;
  }>();
  const router = useRouter();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadAudioLabel, setDownloadAudioLabel] = useState<string | undefined>();
  const [stream, setStream] = useState<StreamPayload | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  /** Embed URL that successfully resolved tracks (may be soft-fallback fsst). */
  const [resolvedPlayerUrl, setResolvedPlayerUrl] = useState<string | undefined>(undefined);
  const [fileList, setFileList] = useState<PlayerFileList | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<WatchProgressRecord | null>(null);
  const [kp, setKp] = useState<KinopoiskEnrichment | null>(null);
  const [kpLoading, setKpLoading] = useState(false);
  const isFavorite = useFavoritesStore((s) =>
    id ? s.items.some((item) => item.id === id) : false
  );
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const clearProgress = useWatchProgressStore((s) => s.clear);
  const downloads = useDownloadsStore((s) => s.items);

  useEffect(
    () =>
      subscribeMovieDetailLoad(href, id, paramPoster, {
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
      }),
    [href, id, paramPoster]
  );

  const isSerial = fileList?.type === 'serial';
  const seasons = useMemo(() => (fileList ? listSeasons(fileList) : []), [fileList]);
  const episodes = useMemo(
    () => (fileList ? listEpisodes(fileList, season) : []),
    [fileList, season]
  );

  const displayTitle = useMemo(() => {
    if (!movie) return paramTitle ?? t('common.movie');
    if (isSerial) {
      return `${movie.title} — ${t('downloads.episodeBadge', { season, episode })}`;
    }
    return movie.title;
  }, [movie, isSerial, season, episode, paramTitle]);

  const offlineCopies = useMemo(() => {
    if (!movie?.id) return [];
    return listCompletedDownloads(
      movie.id,
      downloads,
      isSerial ? season : undefined,
      isSerial ? episode : undefined
    );
  }, [movie?.id, downloads, isSerial, season, episode]);

  const embedDownloadUrl = useMemo(() => {
    if (!movie) return undefined;
    if (resolvedPlayerUrl && isResolvableEmbedUrl(resolvedPlayerUrl)) {
      return resolvedPlayerUrl;
    }
    if (movie.fallbackPlayerUrl && isResolvableEmbedUrl(movie.fallbackPlayerUrl)) {
      return movie.fallbackPlayerUrl;
    }
    if (
      movie.nativePlayer === false &&
      movie.playerUrl &&
      isResolvableEmbedUrl(movie.playerUrl)
    ) {
      return movie.playerUrl;
    }
    return undefined;
  }, [movie, resolvedPlayerUrl]);

  const downloadBlocked = !stream?.hlsSource?.length &&
    (movie?.nativePlayer === false || !!embedDownloadUrl);

  const displayAudioSources = useMemo(
    () => (stream?.hlsSource?.length ? orderAudioSources(stream.hlsSource) : []),
    [stream]
  );

  const activePlayerUrl = useMemo(() => {
    if (!movie?.playerUrl) return undefined;
    // Non-native embeds: prefer the URL that actually resolved tracks (soft-fallback).
    if (movie.nativePlayer === false) return resolvedPlayerUrl ?? movie.playerUrl;
    if (!isSerial || !fileList) return movie.playerUrl;
    const entry = pickEpisodeEntry(
      fileList,
      season,
      episode,
      movie.translationId ? Number(movie.translationId) : undefined
    );
    return buildPlayerUrl(movie.playerUrl, {
      season,
      episode,
      translation: entry?.id_translation ?? movie.translationId,
    });
  }, [movie, isSerial, fileList, season, episode, resolvedPlayerUrl]);

  const openPlayer = useCallback(
    async (opts: { resume: boolean; progress?: WatchProgressRecord | null }) => {
      /* istanbul ignore next -- Watch / resume only invoke when both are set */
      if (!movie || !activePlayerUrl) return;
      const progress = opts.progress;
      const time =
        opts.resume && progress && progress.positionSec > 0
          ? Math.floor(progress.positionSec)
          : 0;

      if (!opts.resume) {
        await clearProgress(
          movie.id,
          isSerial ? season : undefined,
          isSerial ? episode : undefined
        );
      }

      const playerUrl =
        time > 0 ? buildPlayerUrl(activePlayerUrl, { time }) : activePlayerUrl;

      router.push({
        pathname: '/player/[id]',
        params: {
          id: movie.id,
          playerUrl,
          title: displayTitle,
          movieId: movie.id,
          posterUrl: movie.posterUrl ?? '',
          href: movie.href ?? '',
          isSeries: isSerial ? '1' : '0',
          season: isSerial ? String(season) : '',
          episode: isSerial ? String(episode) : '',
          startTime: String(time),
        },
      });
    },
    [
      activePlayerUrl,
      clearProgress,
      displayTitle,
      episode,
      isSerial,
      movie,
      router,
      season,
    ]
  );

  const onWatchPress = useCallback(async () => {
    if (!movie || !activePlayerUrl) return;
    const progress = await fetchProgress(
      movie.id,
      isSerial ? season : undefined,
      isSerial ? episode : undefined
    );
    if (isResumable(progress)) {
      setResumePrompt(progress);
      return;
    }
    await openPlayer({ resume: false, progress });
  }, [activePlayerUrl, episode, isSerial, movie, openPlayer, season]);

  useEffect(() => {
    if (!activePlayerUrl) return;
    if (movie?.nativePlayer === false) {
      if (!isResolvableEmbedUrl(activePlayerUrl)) {
        setStream(null);
        setStreamLoading(false);
        setStreamError(t('movie.tracksUnavailable'));
      }
      // Resolvable embeds: stream is filled by detail-load effect.
      return;
    }
    if (movie?.fallbackPlayerUrl && isResolvableEmbedUrl(movie.fallbackPlayerUrl)) {
      // Native + embess/fsst sibling: tracks come from the embed playlist, not bnsi.
      return;
    }
    setStream(null);
    setStreamError(null);
    setStreamLoading(true);
  }, [activePlayerUrl, movie?.nativePlayer, movie?.fallbackPlayerUrl]);

  useEffect(() => {
    if (!movie || movie.nativePlayer === false) return;
    const fallback = movie.fallbackPlayerUrl;
    if (!fallback || !isResolvableEmbedUrl(fallback)) return;
    let cancelled = false;
    setStreamLoading(true);
    setStreamError(null);
    void resolveEmbedStream(fallback, { season, episode })
      .then((embed) => {
        /* istanbul ignore next -- unmount during sibling resolve */
        if (cancelled) return;
        if (embed?.hlsSource?.length) {
          setStream(embed);
          setResolvedPlayerUrl(fallback);
          setStreamError(null);
        } else {
          setStream(null);
          setResolvedPlayerUrl(undefined);
          setStreamError(t('movie.tracksUnavailable'));
        }
      })
      .catch(() => {
        /* istanbul ignore next -- unmount during sibling resolve */
        if (cancelled) return;
        setStream(null);
        setResolvedPlayerUrl(undefined);
        setStreamError(t('movie.tracksUnavailable'));
      })
      .finally(() => {
        /* istanbul ignore else -- unmount during sibling resolve */
        if (!cancelled) setStreamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movie, season, episode]);

  const onStreamResolved = useCallback((data: StreamPayload) => {
    setStream(data);
    setStreamLoading(false);
    setStreamError(null);
  }, []);

  const onStreamFailed = useCallback((message: string) => {
    setStreamError(message);
    setStreamLoading(false);
  }, []);

  const onToggleFavorite = useCallback(() => {
    if (!id || favoriteBusy) return;
    setFavoriteBusy(true);
    const summary = {
      id,
      slug: movie?.slug ?? id,
      title: movie?.title ?? paramTitle ?? t('common.movie'),
      year: movie?.year,
      posterUrl: movie?.posterUrl ?? (paramPoster && paramPoster.length > 0 ? paramPoster : undefined),
      href: movie?.href ?? href ?? `/${id}.html`,
      kpRating: movie?.kpRating,
      imdbRating: movie?.imdbRating,
      isSeries: movie?.isSeries ?? isSerial,
    };
    void toggleFavorite(summary).finally(() => setFavoriteBusy(false));
  }, [
    id,
    favoriteBusy,
    movie,
    paramTitle,
    paramPoster,
    href,
    isSerial,
    toggleFavorite,
  ]);

  return {
    id,
    paramTitle,
    router,
    movie,
    loading,
    error,
    downloadOpen,
    setDownloadOpen,
    downloadAudioLabel,
    setDownloadAudioLabel,
    stream,
    streamError,
    streamLoading,
    fileList,
    season,
    setSeason,
    episode,
    setEpisode,
    favoriteBusy,
    resumePrompt,
    setResumePrompt,
    kp,
    kpLoading,
    isFavorite,
    isSerial,
    seasons,
    episodes,
    displayTitle,
    offlineCopies,
    embedDownloadUrl,
    downloadBlocked,
    displayAudioSources,
    activePlayerUrl,
    openPlayer,
    onWatchPress,
    onStreamResolved,
    onStreamFailed,
    onToggleFavorite,
  };
}
