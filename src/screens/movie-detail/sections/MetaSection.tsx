import { ActivityIndicator, Text, View } from 'react-native';

import type { KinopoiskEnrichment } from '@/src/data/catalog/kinopoisk';
import { t } from '@/src/shared/i18n';
import { colors } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type MetaSectionProps = {
  kpLoading?: boolean;
  kp?: KinopoiskEnrichment | null;
  description?: string;
};

export function MetaSection({ kpLoading, kp, description }: MetaSectionProps) {
  return (
    <>
      {kpLoading && !kp ? (
        <View style={styles.kpLoading}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.tracksHint}>{t('movie.loadingExtras')}</Text>
        </View>
      ) : null}

      {description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('movie.description')}</Text>
          <Text style={styles.body}>{description}</Text>
        </View>
      ) : null}
    </>
  );
}
