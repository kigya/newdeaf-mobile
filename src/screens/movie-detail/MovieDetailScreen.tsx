import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { fetchMovieDetail, fetchPlayerFileList } from '@/src/data/catalog/catalog';
import {
  isResolvableEmbedUrl,
  resolveEmbedStream,
} from '@/src/data/catalog/embedStreams';
import {
  enrichFromKinopoisk,
  type KinopoiskEnrichment,
} from '@/src/data/catalog/kinopoisk';
import {
  buildPlayerUrl,
  listEpisodes,
  listSeasons,
  pickEpisodeEntry,
} from '@/src/data/catalog/parse';
import { enrichMovieMetadata } from '@/src/data/catalog/tmdb';
import type { MovieDetail, PlayerFileList, StreamPayload } from '@/src/data/catalog/types';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { DownloadSheet } from '@/src/shared/ui/DownloadSheet';
import { orderAudioSources } from '@/src/features/downloads/hls';
import { listCompletedDownloads } from '@/src/features/downloads/match';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { useFavoritesStore } from '@/src/features/favorites/store';
import { useBreakpoint } from '@/src/shared/hooks/useBreakpoint';
import { getLocale, t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { StreamResolver } from '@/src/features/playback/StreamResolver';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';
import { resumeDialogMessage } from '@/src/features/watch-progress/format';
import {
  fetchLatestProgressForMovie,
  fetchProgress,
  useWatchProgressStore,
} from '@/src/features/watch-progress/store';
import { isResumable, type WatchProgressRecord } from '@/src/features/watch-progress/types';

export default function MovieDetailScreen() {
  const { id, href, title: paramTitle, posterUrl: paramPoster } = useLocalSearchParams<{
    id: string;
    href?: string;
    title?: string;
    posterUrl?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTablet, width } = useBreakpoint();
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

  useEffect(() => {
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
  }, [href, id, paramPoster]);

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

  const posterWidth = isTablet ? Math.min(280, width * 0.28) : Math.min(160, width * 0.38);
  const posterHeight = posterWidth * 1.48;
  const trailerId = movie?.trailerYoutubeId;
  const trailerEmbed = trailerId
    ? `https://www.youtube-nocookie.com/embed/${trailerId}?playsinline=1&rel=0`
    : movie?.trailerUrl;

  return (
    <>
      <Stack.Screen
        options={{
          title: movie?.title ?? paramTitle ?? t('common.movie'),
          headerRight: () => (
            <Pressable
              onPress={onToggleFavorite}
              disabled={!id}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                isFavorite ? t('movie.removeFavorite') : t('movie.addFavorite')
              }
              style={({ pressed }) => [{ opacity: pressed || favoriteBusy ? 0.6 : 1, marginRight: 4 }]}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? colors.accent : colors.text}
              />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error || !movie ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error || t('movie.notFound')}</Text>
        </View>
      ) : (
        <View style={styles.root}>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
            <View style={[styles.hero, isTablet && styles.heroTablet]}>
              <View style={{ width: posterWidth, height: posterHeight }}>
                {movie.posterUrl ? (
                  <Image
                    source={{ uri: movie.posterUrl }}
                    style={styles.poster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.poster, styles.posterFallback]}>
                    <Text style={styles.posterLetter}>{movie.title.slice(0, 1)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.title}>{movie.title}</Text>
                {isSerial ? (
                  <View style={styles.serialBadge}>
                    <Text style={styles.serialBadgeText}>{t('movie.serial')}</Text>
                  </View>
                ) : null}
                <View style={styles.ratings}>
                  {movie.kpRating ? (
                    <View style={[styles.rating, { backgroundColor: colors.kp }]}>
                      <Text style={styles.ratingText}>KP {movie.kpRating}</Text>
                    </View>
                  ) : null}
                  {movie.imdbRating ? (
                    <View style={[styles.rating, { backgroundColor: colors.imdb }]}>
                      <Text style={[styles.ratingText, { color: colors.black }]}>
                        IMDb {movie.imdbRating}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {kp?.awards?.length ? (
                  <View style={styles.awardChips}>
                    {kp.awards.map((award) => (
                      <View key={award.name} style={styles.awardChip}>
                        <Text style={styles.awardChipText}>{award.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {movie.year || movie.country || movie.duration ? (
                  <Text style={styles.metaLine}>
                    {[movie.year, movie.country, movie.duration].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {movie.director ? (
                  <Text style={styles.metaLine}>{t('movie.director', { name: movie.director })}</Text>
                ) : null}
                {movie.genres.length ? (
                  <Text style={styles.metaLine}>
                    {t('movie.genre', { list: movie.genres.join(', ') })}
                  </Text>
                ) : null}
              </View>
            </View>

            {kpLoading && !kp ? (
              <View style={styles.kpLoading}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.tracksHint}>{t('movie.loadingExtras')}</Text>
              </View>
            ) : null}

            {isSerial && fileList ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.seasons')}</Text>
                <View style={styles.chips}>
                  {seasons.map((s) => {
                    const active = s === season;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          setSeason(s);
                          const eps = listEpisodes(fileList, s);
                          setEpisode(eps[0] ?? 1);
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t('movie.season', { n: s })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                  {t('movie.episodes')}
                </Text>
                <View style={styles.chips}>
                  {episodes.map((e) => {
                    const active = e === episode;
                    return (
                      <Pressable
                        key={e}
                        onPress={() => setEpisode(e)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t('movie.episode', { n: e })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {movie.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.description')}</Text>
                <Text style={styles.body}>{movie.description}</Text>
              </View>
            ) : null}

            {kp?.staff?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.cast')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.castRow}
                >
                  {kp.staff.map((person) => {
                    const name = person.nameRu || person.nameEn || '';
                    if (!name) return null;
                    return (
                      <View key={`${person.staffId}-${name}`} style={styles.castCard}>
                        {person.posterUrl ? (
                          <Image
                            source={{ uri: person.posterUrl }}
                            style={styles.castAvatar}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.castAvatar, styles.castAvatarFallback]}>
                            <Text style={styles.castAvatarLetter}>{name.slice(0, 1)}</Text>
                          </View>
                        )}
                        <Text style={styles.castName} numberOfLines={2}>
                          {name}
                        </Text>
                        {person.description ? (
                          <Text style={styles.castRole} numberOfLines={2}>
                            {person.description}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : movie.actors.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.cast')}</Text>
                <Text style={styles.body}>{movie.actors.join(', ')}</Text>
              </View>
            ) : null}

            {kp?.facts?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.facts')}</Text>
                {kp.facts.map((fact, index) => (
                  <View key={`${index}-${fact.text.slice(0, 24)}`} style={styles.factCard}>
                    {fact.spoiler ? (
                      <Text style={styles.factSpoiler}>{t('movie.spoiler')}</Text>
                    ) : null}
                    <Text style={styles.factText}>{fact.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {kp?.similar?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.similar')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relatedRow}
                >
                  {kp.similar.map((item) => (
                    <Pressable
                      key={`sim-${item.id}`}
                      style={styles.relatedCard}
                      onPress={() =>
                        router.push({
                          pathname: '/movie/[id]',
                          params: {
                            id: item.id,
                            href: item.href,
                            title: item.title,
                            posterUrl: item.posterUrl ?? '',
                          },
                        })
                      }
                    >
                      {item.posterUrl ? (
                        <Image
                          source={{ uri: item.posterUrl }}
                          style={styles.relatedPoster}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.relatedPoster, styles.posterFallback]}>
                          <Text style={styles.posterLetter}>{item.title.slice(0, 1)}</Text>
                        </View>
                      )}
                      <Text style={styles.relatedTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {kp?.related?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.related')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relatedRow}
                >
                  {kp.related.map((item) => (
                    <Pressable
                      key={`rel-${item.id}`}
                      style={styles.relatedCard}
                      onPress={() =>
                        router.push({
                          pathname: '/movie/[id]',
                          params: {
                            id: item.id,
                            href: item.href,
                            title: item.title,
                            posterUrl: item.posterUrl ?? '',
                          },
                        })
                      }
                    >
                      {item.posterUrl ? (
                        <Image
                          source={{ uri: item.posterUrl }}
                          style={styles.relatedPoster}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.relatedPoster, styles.posterFallback]}>
                          <Text style={styles.posterLetter}>{item.title.slice(0, 1)}</Text>
                        </View>
                      )}
                      <Text style={styles.relatedTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {activePlayerUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.audioSubs')}</Text>
                {streamLoading && !stream ? (
                  <View style={styles.tracksLoading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.tracksHint}>{t('movie.loadingTracks')}</Text>
                  </View>
                ) : null}
                {streamError && !stream ? (
                  <Text style={styles.tracksHint}>{streamError}</Text>
                ) : null}
                {displayAudioSources.length ? (
                  <>
                    <Text style={styles.chipLabel}>{t('movie.audio')}</Text>
                    <View style={styles.chips}>
                      {displayAudioSources.map((source, index) => (
                        <Pressable
                          key={`${source.label}-${index}`}
                          onPress={() => {
                            setDownloadAudioLabel(source.label);
                            setDownloadOpen(true);
                          }}
                          style={[styles.chip, index === 0 && styles.chipActive]}
                        >
                          <Text
                            style={[styles.chipText, index === 0 && styles.chipTextActive]}
                            numberOfLines={2}
                          >
                            {source.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                {stream?.tracks?.length ? (
                  <>
                    <Text style={[styles.chipLabel, { marginTop: spacing.md }]}>
                      {t('movie.subtitles')}
                    </Text>
                    <View style={styles.chips}>
                      {stream.tracks.map((track, index) => (
                        <View key={`${track.label}-${index}`} style={styles.chip}>
                          <Text style={styles.chipText} numberOfLines={2}>
                            {track.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                {streamLoading &&
                !stream &&
                movie.nativePlayer !== false &&
                !(movie.fallbackPlayerUrl && isResolvableEmbedUrl(movie.fallbackPlayerUrl)) ? (
                  <View style={styles.hiddenResolver} pointerEvents="none">
                    <StreamResolver
                      key={activePlayerUrl}
                      playerUrl={activePlayerUrl}
                      onResolved={onStreamResolved}
                      onError={onStreamFailed}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {trailerId || trailerEmbed ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.trailer')}</Text>
                {trailerId ? (
                  <Pressable
                    style={styles.trailerCard}
                    onPress={() =>
                      void WebBrowser.openBrowserAsync(
                        `https://www.youtube.com/watch?v=${trailerId}`
                      )
                    }
                  >
                    <View style={styles.trailerPlay}>
                      <Ionicons name="logo-youtube" size={36} color={colors.accent} />
                    </View>
                    <Text style={styles.trailerOpenText}>{t('movie.watchTrailer')}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.trailerWrap}>
                    <WebView
                      source={{ uri: trailerEmbed as string }}
                      style={styles.trailer}
                      allowsFullscreenVideo
                      mediaPlaybackRequiresUserAction
                      javaScriptEnabled
                      domStorageEnabled
                      setSupportMultipleWindows={false}
                    />
                  </View>
                )}
              </View>
            ) : null}

            {!movie.playerUrl ? (
              <Text style={[styles.error, { paddingHorizontal: spacing.lg }]}>
                {t('movie.noPlayer')}
              </Text>
            ) : null}

            {offlineCopies.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.downloadedSection')}</Text>
                {offlineCopies.map((item) => (
                  <View key={item.id} style={styles.offlineCard}>
                    <View style={styles.offlineMeta}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={styles.offlineTracks} numberOfLines={3}>
                        {t('movie.downloadedTracks', {
                          audio: item.audioLabel,
                          subs: item.subtitleLabel,
                          quality: item.quality,
                        })}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.offlineBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/offline/[downloadId]',
                          params: { downloadId: item.id },
                        })
                      }
                    >
                      <Ionicons name="play-circle" size={18} color={colors.black} />
                      <Text style={styles.offlineBtnText}>{t('movie.watchOffline')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <LinearGradient
            colors={['transparent', colors.bg]}
            style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}
          >
            {downloadBlocked && !streamLoading ? (
              <Text style={styles.downloadHint}>{t('movie.downloadUnavailable')}</Text>
            ) : null}
            <View style={styles.ctaRow}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, !activePlayerUrl && styles.btnDisabled]}
                onPress={() => void onWatchPress()}
              >
                <Ionicons name="play" size={20} color={colors.black} />
                <Text style={styles.btnPrimaryText}>{t('common.watch')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnSecondary,
                  (!activePlayerUrl || downloadBlocked) && styles.btnDisabled,
                ]}
                onPress={() => {
                  if (downloadBlocked) return;
                  setDownloadAudioLabel(undefined);
                  setDownloadOpen(true);
                }}
              >
                <Ionicons name="download-outline" size={20} color={colors.accent} />
                <Text style={styles.btnSecondaryText}>{t('common.download')}</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {downloadOpen && activePlayerUrl ? (
            <DownloadSheet
              visible={downloadOpen}
              onClose={() => setDownloadOpen(false)}
              movieId={
                isSerial ? `${movie.id}_s${season}_e${episode}` : movie.id
              }
              title={displayTitle}
              posterUrl={movie.posterUrl}
              playerUrl={embedDownloadUrl ?? activePlayerUrl}
              initialStream={stream}
              initialAudioLabel={downloadAudioLabel}
              season={isSerial ? season : undefined}
              episode={isSerial ? episode : undefined}
            />
          ) : null}

          <ConfirmDialog
            visible={!!resumePrompt}
            title={t('resume.title')}
            message={resumePrompt ? resumeDialogMessage(resumePrompt) : undefined}
            confirmLabel={t('resume.continue')}
            cancelLabel={t('resume.startOver')}
            onConfirm={() => {
              const progress = resumePrompt;
              setResumePrompt(null);
              void openPlayer({ resume: true, progress });
            }}
            onCancel={() => {
              const progress = resumePrompt;
              setResumePrompt(null);
              void openPlayer({ resume: false, progress });
            }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  hero: {
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroTablet: {
    paddingTop: spacing.xl,
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterLetter: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 42,
  },
  heroMeta: {
    flex: 1,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  serialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  serialBadgeText: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
    fontSize: 11,
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rating: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  awardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  awardChip: {
    backgroundColor: colors.bgMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  awardChipText: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
    fontSize: 11,
  },
  kpLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  castRow: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  castCard: {
    width: 96,
  },
  castAvatar: {
    width: 96,
    height: 128,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    marginBottom: spacing.xs,
  },
  castAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  castAvatarLetter: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 28,
  },
  castName: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  castRole: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  factCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  factSpoiler: {
    color: colors.danger,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  factText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  relatedRow: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  relatedCard: {
    width: 110,
  },
  relatedPoster: {
    width: 110,
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    marginBottom: spacing.xs,
  },
  relatedTitle: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  metaLine: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  offlineCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  offlineMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  offlineTracks: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  offlineBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  offlineBtnText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
  },
  tracksLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tracksHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.accent,
  },
  hiddenResolver: {
    position: 'absolute',
    width: 320,
    height: 180,
    left: -9999,
    top: 0,
    opacity: 0.01,
  },
  trailerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trailer: {
    flex: 1,
    backgroundColor: colors.black,
  },
  trailerCard: {
    width: '100%',
    minHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  trailerPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailerOpenText: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnSecondary: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  downloadHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  btnPrimaryText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  btnSecondaryText: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
});
