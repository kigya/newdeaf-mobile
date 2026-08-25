import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { t } from '@/src/shared/i18n';
import { colors, spacing } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type StickyActionsProps = {
  insetsBottom: number;
  downloadBlocked: boolean;
  streamLoading: boolean;
  activePlayerUrl: string | undefined;
  onWatchPress: () => void;
  onDownloadPress: () => void;
  onAddToList?: () => void;
};

export function StickyActions({
  insetsBottom,
  downloadBlocked,
  streamLoading,
  activePlayerUrl,
  onWatchPress,
  onDownloadPress,
  onAddToList,
}: StickyActionsProps) {
  return (
    <LinearGradient
      colors={['transparent', colors.bg]}
      style={[styles.ctaBar, { paddingBottom: insetsBottom + spacing.md }]}
    >
      {downloadBlocked && !streamLoading ? (
        <Text style={styles.downloadHint}>{t('movie.downloadUnavailable')}</Text>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable
          style={[styles.btn, styles.btnPrimary, !activePlayerUrl && styles.btnDisabled]}
          onPress={onWatchPress}
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
          onPress={onDownloadPress}
        >
          <Ionicons name="download-outline" size={20} color={colors.accent} />
          <Text style={styles.btnSecondaryText}>{t('common.download')}</Text>
        </Pressable>
      </View>
      {onAddToList ? (
        <Pressable
          testID="movie-add-to-list"
          onPress={onAddToList}
          style={{ marginTop: spacing.sm, alignItems: 'center' }}
        >
          <Text style={styles.btnSecondaryText}>{t('movie.addToList')}</Text>
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}
