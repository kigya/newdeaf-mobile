import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { DownloadRecord } from '@/src/features/downloads/types';
import { t } from '@/src/shared/i18n';
import { colors } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type OfflineCopiesSectionProps = {
  copies: DownloadRecord[];
  onWatchOffline: (downloadId: string) => void;
};

export function OfflineCopiesSection({
  copies,
  onWatchOffline,
}: OfflineCopiesSectionProps) {
  if (copies.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.downloadedSection')}</Text>
      {copies.map((item) => (
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
            onPress={() => onWatchOffline(item.id)}
          >
            <Ionicons name="play-circle" size={18} color={colors.black} />
            <Text style={styles.offlineBtnText}>{t('movie.watchOffline')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
