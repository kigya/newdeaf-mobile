import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { KinopoiskRelatedMovie } from '@/src/data/catalog/kinopoisk';
import { t } from '@/src/shared/i18n';
import { styles } from '@/src/screens/movie-detail/styles';

type RelatedRailsProps = {
  similar?: KinopoiskRelatedMovie[];
  related?: KinopoiskRelatedMovie[];
  sequels?: KinopoiskRelatedMovie[];
  onOpenMovie: (item: KinopoiskRelatedMovie) => void;
};

export function RelatedRails({ similar, related, sequels, onOpenMovie }: RelatedRailsProps) {
  return (
    <>
      {similar?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('movie.similar')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.relatedRow}
          >
            {similar.map((item) => (
              <Pressable
                key={`sim-${item.id}`}
                style={styles.relatedCard}
                onPress={() => onOpenMovie(item)}
              >
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.relatedPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.relatedPoster, styles.posterFallback]}>
                    <Text style={styles.posterLetter}>{item.title.slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.relatedTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {related?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('movie.related')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.relatedRow}
          >
            {related.map((item) => (
              <Pressable
                key={`rel-${item.id}`}
                style={styles.relatedCard}
                onPress={() => onOpenMovie(item)}
              >
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.relatedPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.relatedPoster, styles.posterFallback]}>
                    <Text style={styles.posterLetter}>{item.title.slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.relatedTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {sequels?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('movie.sequels')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.relatedRow}
          >
            {sequels.map((item) => (
              <Pressable
                key={`seq-${item.id}`}
                style={styles.relatedCard}
                onPress={() => onOpenMovie(item)}
              >
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.relatedPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.relatedPoster, styles.posterFallback]}>
                    <Text style={styles.posterLetter}>{item.title.slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.relatedTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}
