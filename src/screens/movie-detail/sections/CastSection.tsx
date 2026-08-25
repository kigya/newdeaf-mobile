import { Image } from 'expo-image';
import { ScrollView, Text, View } from 'react-native';

import type { KinopoiskEnrichment } from '@/src/data/catalog/kinopoisk';
import { t } from '@/src/shared/i18n';
import { styles } from '@/src/screens/movie-detail/styles';

type CastSectionProps = {
  kp: KinopoiskEnrichment | null;
  actors: string[];
};

export function CastSection({ kp, actors }: CastSectionProps) {
  if (kp?.staff?.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('movie.cast')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.castRow}
        >
          {kp.staff.map((person) => {
            const name = person.nameRu || person.nameEn || '';
            if (!name) return null;
            return (
              <View key={`${person.staffId}-${name}`} style={styles.castCard}>
                {person.posterUrl ? (
                  <Image
                    source={{ uri: person.posterUrl }}
                    style={styles.castAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.castAvatar, styles.castAvatarFallback]}>
                    <Text style={styles.castAvatarLetter}>{name.slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.castName} numberOfLines={2}>
                  {name}
                </Text>
                {person.description ? (
                  <Text style={styles.castRole} numberOfLines={2}>
                    {person.description}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (actors.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('movie.cast')}</Text>
        <Text style={styles.body}>{actors.join(', ')}</Text>
      </View>
    );
  }

  return null;
}
