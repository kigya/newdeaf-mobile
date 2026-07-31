import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getDownload } from '@/src/downloads/db';
import type { DownloadRecord } from '@/src/downloads/types';
import { t } from '@/src/i18n';
import { OfflinePlayer } from '@/src/offline/OfflinePlayer';
import { colors, fonts } from '@/src/theme';

export default function OfflinePlayerScreen() {
  const { downloadId } = useLocalSearchParams<{ downloadId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<DownloadRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getDownload(downloadId);
        if (!cancelled) {
          if (!row?.playlistPath) setError(t('offline.fileNotFound'));
          else setItem(row);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.error'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [downloadId]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!item?.playlistPath) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
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
