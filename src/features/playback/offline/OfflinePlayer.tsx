import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  MediaPlayer,
  type MediaProgressPayload,
} from '@/src/features/playback/MediaPlayer';
import { prepareLocalPlaybackUri } from '@/src/features/playback/offline/prepareLocalSource';
import { t } from '@/src/shared/i18n';
import { colors, fonts, spacing } from '@/src/shared/theme';

export type OfflineProgressPayload = MediaProgressPayload;

type Props = {
  playlistPath: string;
  subtitlePath?: string;
  title?: string;
  mediaKind?: 'hls' | 'progressive';
  initialPositionSec?: number;
  onProgress?: (payload: OfflineProgressPayload) => void;
  onClose?: () => void;
};

/** Thin wrapper around MediaPlayer for local downloads. */
export function OfflinePlayer({
  playlistPath,
  subtitlePath,
  title,
  mediaKind = 'hls',
  initialPositionSec = 0,
  onProgress,
  onClose,
}: Props) {
  const [readyUri, setReadyUri] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadyUri(null);
    setPrepareError(null);
    void (async () => {
      try {
        const uri = await prepareLocalPlaybackUri(playlistPath, mediaKind);
        if (!cancelled) setReadyUri(uri);
      } catch (e) {
        if (!cancelled) {
          setPrepareError(e instanceof Error ? e.message : t('offline.playbackError'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlistPath, mediaKind]);

  if (prepareError) {
    return (
      <View style={styles.loader}>
        <Text style={styles.error}>{prepareError}</Text>
      </View>
    );
  }

  if (!readyUri) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <MediaPlayer
      uri={readyUri}
      contentType={mediaKind}
      subtitlePath={subtitlePath}
      title={title}
      initialPositionSec={initialPositionSec}
      onProgress={onProgress}
      onClose={onClose}
      enableBackgroundPlayback
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
    paddingHorizontal: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
