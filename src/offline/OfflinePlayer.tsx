import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  MediaPlayer,
  type MediaProgressPayload,
} from '@/src/player/MediaPlayer';
import { prepareLocalPlaybackUri } from '@/src/offline/prepareLocalSource';
import { colors } from '@/src/theme';

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

  useEffect(() => {
    let cancelled = false;
    setReadyUri(null);
    void (async () => {
      try {
        const uri = await prepareLocalPlaybackUri(playlistPath, mediaKind);
        if (!cancelled) setReadyUri(uri);
      } catch {
        if (!cancelled) setReadyUri(playlistPath);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlistPath, mediaKind]);

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
  },
});
