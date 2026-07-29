import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { fetchMovieDetail } from '@/src/api/catalog';
import type { MovieDetail, StreamPayload } from '@/src/api/types';
import { DownloadSheet } from '@/src/components/DownloadSheet';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { StreamResolver } from '@/src/player/StreamResolver';
import { colors, fonts, radius, spacing } from '@/src/theme';

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setStreamError(null);
    void (async () => {
      try {
        const detail = await fetchMovieDetail(href || id);
        if (!cancelled) {
          const listPoster = paramPoster && paramPoster.length > 0 ? paramPoster : undefined;
          setMovie({
            ...detail,
            posterUrl: detail.posterUrl || listPoster,
          });
          if (detail.playerUrl) setStreamLoading(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [href, id, paramPoster]);

  const onStreamResolved = useCallback((data: StreamPayload) => {
    setStream(data);
    setStreamLoading(false);
    setStreamError(null);
  }, []);

  const onStreamFailed = useCallback((message: string) => {
    setStreamError(message);
    setStreamLoading(false);
  }, []);

  const posterWidth = isTablet ? Math.min(280, width * 0.28) : Math.min(160, width * 0.38);
  const posterHeight = posterWidth * 1.48;
  const trailerId = movie?.trailerYoutubeId;
  const trailerEmbed = trailerId
    ? `https://www.youtube-nocookie.com/embed/${trailerId}?playsinline=1&rel=0`
    : movie?.trailerUrl;

  return (
    <>
      <Stack.Screen options={{ title: movie?.title ?? paramTitle ?? 'Фильм' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error || !movie ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? 'Фильм не найден'}</Text>
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
                  <Text style={styles.metaLine}>Режиссёр: {movie.director}</Text>
                ) : null}
                {movie.genres.length ? (
                  <Text style={styles.metaLine}>Жанр: {movie.genres.join(', ')}</Text>
                ) : null}
              </View>
            </View>

            {movie.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Описание</Text>
                <Text style={styles.body}>{movie.description}</Text>
              </View>
            ) : null}

            {movie.actors.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>В ролях</Text>
                <Text style={styles.body}>{movie.actors.join(', ')}</Text>
              </View>
            ) : null}

            {movie.playerUrl ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Озвучка и субтитры</Text>
                {streamLoading && !stream ? (
                  <View style={styles.tracksLoading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.tracksHint}>Загружаем дорожки…</Text>
                  </View>
                ) : null}
                {streamError && !stream ? (
                  <Text style={styles.tracksHint}>Не удалось загрузить список дорожек</Text>
                ) : null}
                {stream?.hlsSource?.length ? (
                  <>
                    <Text style={styles.chipLabel}>Озвучка</Text>
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
                    <Text style={[styles.chipLabel, { marginTop: spacing.md }]}>Субтитры</Text>
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
                      playerUrl={movie.playerUrl}
                      onResolved={onStreamResolved}
                      onError={onStreamFailed}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {trailerId || trailerEmbed ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Трейлер</Text>
                {trailerId ? (
                  <Pressable
                    style={styles.trailerCard}
                    onPress={() =>
                      void WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${trailerId}`)
                    }
                  >
                    <View style={styles.trailerPlay}>
                      <Ionicons name="logo-youtube" size={36} color={colors.accent} />
                    </View>
                    <Text style={styles.trailerOpenText}>Смотреть трейлер на YouTube</Text>
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
                Плеер для этого фильма не найден
              </Text>
            ) : null}
          </ScrollView>

          <LinearGradient
            colors={['transparent', colors.bg]}
            style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}
          >
            <Pressable
              style={[styles.btn, styles.btnPrimary, !movie.playerUrl && styles.btnDisabled]}
              disabled={!movie.playerUrl}
              onPress={() =>
                router.push({
                  pathname: '/player/[id]',
                  params: {
                    id: movie.id,
                    playerUrl: movie.playerUrl!,
                    title: movie.title,
                  },
                })
              }
            >
              <Ionicons name="play" size={20} color={colors.black} />
              <Text style={styles.btnPrimaryText}>Смотреть</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnSecondary, !movie.playerUrl && styles.btnDisabled]}
              disabled={!movie.playerUrl}
              onPress={() => setDownloadOpen(true)}
            >
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={styles.btnSecondaryText}>Скачать</Text>
            </Pressable>
          </LinearGradient>

          {downloadOpen && movie.playerUrl ? (
            <DownloadSheet
              visible={downloadOpen}
              onClose={() => setDownloadOpen(false)}
              movieId={movie.id}
              title={movie.title}
              posterUrl={movie.posterUrl}
              playerUrl={movie.playerUrl}
            />
          ) : null}
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
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
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
