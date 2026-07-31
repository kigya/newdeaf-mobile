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

import { fetchMovieDetail, fetchPlayerFileList } from '@/src/api/catalog';
import {
  buildPlayerUrl,
  listEpisodes,
  listSeasons,
  pickEpisodeEntry,
} from '@/src/api/parse';
import type { MovieDetail, PlayerFileList, StreamPayload } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { DownloadSheet } from '@/src/components/DownloadSheet';
import { useFavoritesStore } from '@/src/favorites/store';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { t } from '@/src/i18n';
import { StreamResolver } from '@/src/player/StreamResolver';
import { colors, fonts, radius, spacing } from '@/src/theme';
import { resumeDialogMessage } from '@/src/watch-progress/format';
import {
  fetchLatestProgressForMovie,
  fetchProgress,
  useWatchProgressStore,
} from '@/src/watch-progress/store';
import { isResumable, type WatchProgressRecord } from '@/src/watch-progress/types';

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
  const [stream, setStream] = useState<StreamPayload | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [fileList, setFileList] = useState<PlayerFileList | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<WatchProgressRecord | null>(null);
  const isFavorite = useFavoritesStore((s) =>
    id ? s.items.some((item) => item.id === id) : false
  );
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const clearProgress = useWatchProgressStore((s) => s.clear);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setStreamError(null);
    setFileList(null);
    setResumePrompt(null);
    void (async () => {
      try {
        const detail = await fetchMovieDetail(href || id);
        if (cancelled) return;
        const listPoster = paramPoster && paramPoster.length > 0 ? paramPoster : undefined;
        setMovie({
          ...detail,
          posterUrl: detail.posterUrl || listPoster,
        });
        if (detail.season) setSeason(detail.season);
        if (detail.episode) setEpisode(detail.episode);
        if (detail.playerUrl) {
          setStreamLoading(true);
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
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.loadingError'));
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

  const activePlayerUrl = useMemo(() => {
    if (!movie?.playerUrl) return undefined;
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
  }, [movie, isSerial, fileList, season, episode]);

  const openPlayer = useCallback(
    async (opts: { resume: boolean; progress?: WatchProgressRecord | null }) => {
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
        time > 0
          ? buildPlayerUrl(activePlayerUrl, { time })
          : activePlayerUrl;

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
    setStream(null);
    setStreamError(null);
    setStreamLoading(true);
  }, [activePlayerUrl]);

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
              disabled={!id || favoriteBusy}
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
          <Text style={styles.error}>{error ?? t('movie.notFound')}</Text>
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

            {movie.actors.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('movie.cast')}</Text>
                <Text style={styles.body}>{movie.actors.join(', ')}</Text>
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
                  <Text style={styles.tracksHint}>{t('movie.tracksFailed')}</Text>
                ) : null}
                {stream?.hlsSource?.length ? (
                  <>
                    <Text style={styles.chipLabel}>{t('movie.audio')}</Text>
                    <View style={styles.chips}>
                      {stream.hlsSource.map((source, index) => (
                        <View key={`${source.label}-${index}`} style={styles.chip}>
                          <Text style={styles.chipText} numberOfLines={2}>
                            {source.label}
                          </Text>
                        </View>
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
                {streamLoading && !stream ? (
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
                ) : trailerEmbed ? (
                  <View style={styles.trailerWrap}>
                    <WebView
                      source={{ uri: trailerEmbed }}
                      style={styles.trailer}
                      allowsFullscreenVideo
                      mediaPlaybackRequiresUserAction
                      javaScriptEnabled
                      domStorageEnabled
                      setSupportMultipleWindows={false}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {!movie.playerUrl ? (
              <Text style={[styles.error, { paddingHorizontal: spacing.lg }]}>
                {t('movie.noPlayer')}
              </Text>
            ) : null}
          </ScrollView>

          <LinearGradient
            colors={['transparent', colors.bg]}
            style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}
          >
            <Pressable
              style={[styles.btn, styles.btnPrimary, !activePlayerUrl && styles.btnDisabled]}
              disabled={!activePlayerUrl}
              onPress={() => void onWatchPress()}
            >
              <Ionicons name="play" size={20} color={colors.black} />
              <Text style={styles.btnPrimaryText}>{t('common.watch')}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnSecondary, !activePlayerUrl && styles.btnDisabled]}
              disabled={!activePlayerUrl}
              onPress={() => setDownloadOpen(true)}
            >
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={styles.btnSecondaryText}>{t('common.download')}</Text>
            </Pressable>
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
              playerUrl={activePlayerUrl}
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
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
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
