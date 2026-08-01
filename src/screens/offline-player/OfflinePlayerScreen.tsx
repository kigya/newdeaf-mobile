import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { getDownload } from '@/src/features/downloads/db';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { t } from '@/src/shared/i18n';
import { OfflinePlayer } from '@/src/features/playback/offline/OfflinePlayer';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { colors, fonts } from '@/src/shared/theme';
import { resumeDialogMessage } from '@/src/features/watch-progress/format';
import { fetchProgress, useWatchProgressStore } from '@/src/features/watch-progress/store';
import {
  catalogMovieIdFromDownloadMovieId,
  isResumable,
  type WatchProgressRecord,
} from '@/src/features/watch-progress/types';

type PlayMode = 'checking' | 'prompt' | 'playing';

export default function OfflinePlayerScreen() {
  const { downloadId } = useLocalSearchParams<{ downloadId: string }>();
  const router = useRouter();
  const upsertProgress = useWatchProgressStore((s) => s.upsert);
  const clearProgress = useWatchProgressStore((s) => s.clear);

  const [item, setItem] = useState<DownloadRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>('checking');
  const [resumeTarget, setResumeTarget] = useState<WatchProgressRecord | null>(null);
  const [initialPositionSec, setInitialPositionSec] = useState(0);
  const saveGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getDownload(downloadId);
        if (cancelled) return;
        if (!row?.playlistPath) {
          setError(t('offline.fileNotFound'));
          return;
        }
        setItem(row);

        const catalogId = catalogMovieIdFromDownloadMovieId(
          row.movieId,
          row.season,
          row.episode
        );
        const saved = await fetchProgress(catalogId, row.season, row.episode);
        if (cancelled) return;
        if (isResumable(saved)) {
          setResumeTarget(saved);
          setPlayMode('prompt');
        } else {
          setInitialPositionSec(0);
          setPlayMode('playing');
        }
      } catch (e) {
        if (cancelled) return;
        setError(errorMessage(e, t('common.error')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [downloadId]);

  const startPlayback = useCallback(
    async (mode: 'resume' | 'start') => {
      // Prompt UI only mounts after `item` is loaded.
      const row = item as DownloadRecord;
      const catalogId = catalogMovieIdFromDownloadMovieId(
        row.movieId,
        row.season,
        row.episode
      );
      if (mode === 'start') {
        await clearProgress(catalogId, row.season, row.episode);
        setInitialPositionSec(0);
      } else {
        setInitialPositionSec(resumeTarget?.positionSec ?? 0);
      }
      setPlayMode('playing');
    },
    [clearProgress, item, resumeTarget]
  );

  const handleProgress = useCallback(
    (payload: { positionSec: number; durationSec?: number }) => {
      // OfflinePlayer only mounts when `item` is loaded.
      const row = item as DownloadRecord;
      const catalogId = catalogMovieIdFromDownloadMovieId(
        row.movieId,
        row.season,
        row.episode
      );
      const gen = ++saveGenRef.current;
      void upsertProgress({
        movieId: catalogId,
        season: row.season,
        episode: row.episode,
        positionSec: payload.positionSec,
        durationSec: payload.durationSec,
        title: row.title,
        posterUrl: row.posterUrl,
        isSeries: row.season != null && row.episode != null,
        source: 'offline',
        downloadId: row.id,
        saveGeneration: gen,
      });
    },
    [item, upsertProgress]
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!item?.playlistPath || playMode === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (playMode === 'prompt') {
    return (
      <View style={styles.root}>
        <StatusBar style="light" hidden />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
        <ConfirmDialog
          visible
          title={t('resume.title')}
          message={resumeDialogMessage(resumeTarget as WatchProgressRecord)}
          confirmLabel={t('resume.continue')}
          cancelLabel={t('resume.startOver')}
          onConfirm={() => void startPlayback('resume')}
          onCancel={() => void startPlayback('start')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden />
      <OfflinePlayer
        playlistPath={item.playlistPath}
        subtitlePath={item.subtitlePath}
        title={item.title}
        mediaKind={item.mediaKind}
        initialPositionSec={initialPositionSec}
        onProgress={handleProgress}
        onClose={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
  },
});
