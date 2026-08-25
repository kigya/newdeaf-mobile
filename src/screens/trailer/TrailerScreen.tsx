import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { isDownloadGateError } from '@/src/features/downloads/errors';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { resolveYoutubeStream } from '@/src/features/downloads/youtube';
import { MediaPlayer } from '@/src/features/playback/MediaPlayer';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { colors, fonts, spacing } from '@/src/shared/theme';

export default function TrailerScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const router = useRouter();
  const enqueueYoutube = useDownloadsStore((s) => s.enqueueYoutube);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<'hls' | 'progressive'>('progressive');
  const [title, setTitle] = useState(t('trailer.title'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<'wifi' | 'storage' | null>(null);

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolveYoutubeStream(youtubeUrl)
      .then((resolved) => {
        if (cancelled) return;
        setStreamUrl(resolved.streamUrl);
        setKind(resolved.mediaKind);
        setTitle(resolved.title || t('trailer.title'));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e, t('trailer.fallback')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [youtubeUrl]);

  const openFallback = useCallback(() => {
    void WebBrowser.openBrowserAsync(youtubeUrl);
  }, [youtubeUrl]);

  const onDownload = useCallback(
    (force?: boolean) => {
      const run = force
        ? enqueueYoutube(youtubeUrl, undefined, { force: true })
        : enqueueYoutube(youtubeUrl);
      void run.catch((e) => {
        if (isDownloadGateError(e)) setGate(e.code);
        else setError(t('youtube.startFailed'));
      });
    },
    [enqueueYoutube, youtubeUrl]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" hidden />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!streamUrl) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" hidden />
        <Text style={styles.error}>{error ?? t('trailer.fallback')}</Text>
        <Pressable onPress={openFallback} style={styles.btn}>
          <Text style={styles.btnText}>{t('trailer.openYoutube')}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden />
      <MediaPlayer
        uri={streamUrl}
        contentType={kind}
        title={title}
        onClose={() => router.back()}
      >
        <Pressable onPress={() => onDownload()} style={styles.downloadFab}>
          <Text style={styles.downloadFabText}>{t('trailer.download')}</Text>
        </Pressable>
      </MediaPlayer>
      <ConfirmDialog
        visible={gate != null}
        title={gate === 'wifi' ? t('downloadSheet.wifiTitle') : t('downloadSheet.storageTitle')}
        message={gate === 'wifi' ? t('downloads.wifiBlocked') : t('downloads.storageBlocked')}
        confirmLabel={t('downloads.downloadAnyway')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setGate(null);
          onDownload(true);
        }}
        onCancel={() => setGate(null)}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  btnText: {
    color: colors.black,
    fontFamily: fonts.semiBold,
  },
  btnGhost: {
    padding: spacing.sm,
  },
  btnGhostText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  downloadFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  downloadFabText: {
    color: colors.black,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
});
