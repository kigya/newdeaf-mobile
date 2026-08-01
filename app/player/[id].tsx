import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { PlayerWebView } from '@/src/player/PlayerWebView';
import { t } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';
import { useWatchProgressStore } from '@/src/watch-progress/store';
import { sanitizeDurationSec } from '@/src/watch-progress/types';

const PROGRESS_THROTTLE_MS = 2000;

function parseOptionalInt(value?: string): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function OnlinePlayerScreen() {
  const {
    playerUrl,
    title,
    movieId,
    posterUrl,
    href,
    isSeries,
    season: seasonParam,
    episode: episodeParam,
    startTime: startTimeParam,
  } = useLocalSearchParams<{
    id: string;
    playerUrl: string;
    title?: string;
    movieId?: string;
    posterUrl?: string;
    href?: string;
    isSeries?: string;
    season?: string;
    episode?: string;
    startTime?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const upsertProgress = useWatchProgressStore((s) => s.upsert);

  const season = parseOptionalInt(seasonParam);
  const episode = parseOptionalInt(episodeParam);
  const startTime = parseOptionalInt(startTimeParam) ?? 0;
  const resolvedMovieId = movieId || undefined;

  /** Last position reported by the WebView hook (seek-aware). */
  const lastPositionRef = useRef(startTime > 0 ? startTime : 0);
  const lastDurationRef = useRef<number | undefined>(undefined);
  const lastProgressAtRef = useRef(0);
  /** Monotonic save generation — older async upserts must not win. */
  const saveGenRef = useRef(0);
  const metaRef = useRef({
    movieId: resolvedMovieId,
    title: title ?? t('common.player'),
    posterUrl: posterUrl || undefined,
    href: href || undefined,
    isSeries: isSeries === '1',
    season,
    episode,
  });
  metaRef.current = {
    movieId: resolvedMovieId,
    title: title ?? t('common.player'),
    posterUrl: posterUrl || undefined,
    href: href || undefined,
    isSeries: isSeries === '1',
    season,
    episode,
  };

  const saveProgress = useCallback(
    (positionSec: number, durationSec?: number, force = false) => {
      const meta = metaRef.current;
      if (!meta.movieId) return;
      const now = Date.now();
      if (!force && now - lastProgressAtRef.current < PROGRESS_THROTTLE_MS) return;
      lastProgressAtRef.current = now;
      const position = Math.max(0, positionSec);
      const safeDuration = sanitizeDurationSec(position, durationSec);
      if (safeDuration != null) {
        lastDurationRef.current = safeDuration;
      }
      const gen = ++saveGenRef.current;
      void upsertProgress({
        movieId: meta.movieId,
        season: meta.isSeries ? meta.season : undefined,
        episode: meta.isSeries ? meta.episode : undefined,
        positionSec: position,
        durationSec: safeDuration ?? lastDurationRef.current,
        title: meta.title,
        posterUrl: meta.posterUrl,
        href: meta.href,
        isSeries: meta.isSeries,
        source: 'online',
        saveGeneration: gen,
      });
    },
    [upsertProgress]
  );

  const onProgress = useCallback(
    (payload: { currentTime: number; duration?: number }) => {
      // Last WebView report always wins for in-memory position (supports seek back/forward).
      lastPositionRef.current = payload.currentTime;
      const safe = sanitizeDurationSec(payload.currentTime, payload.duration);
      if (safe != null) lastDurationRef.current = safe;
      saveProgress(payload.currentTime, payload.duration);
    },
    [saveProgress]
  );

  // Do NOT seed DB on mount with startTime — that races later seek progress and can
  // overwrite a newer position with the old resume point.

  useEffect(() => {
    return () => {
      saveProgress(lastPositionRef.current, lastDurationRef.current, true);
    };
  }, [saveProgress]);

  const handleClose = () => {
    saveProgress(lastPositionRef.current, lastDurationRef.current, true);
    router.back();
  };

  if (!playerUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('movie.noPlayer')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden />
      <PlayerWebView playerUrl={playerUrl} mode="watch" onProgress={onProgress} />
      <View style={[styles.top, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={handleClose} hitSlop={12} style={styles.back}>
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? t('common.player')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
    padding: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
});
