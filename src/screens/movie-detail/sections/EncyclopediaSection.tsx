import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { formatAgeRating } from '@/src/data/catalog/kinopoisk/ageRating';
import type { KinopoiskExtras } from '@/src/data/catalog/kinopoisk';
import type { TmdbExtras } from '@/src/data/catalog/tmdb';
import { t } from '@/src/shared/i18n';
import { styles } from '@/src/screens/movie-detail/styles';

type Props = {
  extras: KinopoiskExtras | null;
  tmdb: TmdbExtras | null;
  siteSeasonCount?: number;
};

export function EncyclopediaMeta({ extras, tmdb, siteSeasonCount }: Props) {
  const slogan = extras?.slogan;
  const age = formatAgeRating(extras?.ageRating);
  const length = extras?.filmLengthMin;
  const kpSeasons = extras?.seasons?.length;
  const stills = extras?.images?.length
    ? extras.images.map((i) => i.previewUrl || i.imageUrl)
    : tmdb?.stills ?? [];

  if (!slogan && !age && !length && !stills.length && !kpSeasons) return null;

  return (
    <View style={styles.section}>
      {slogan ? <Text style={styles.body}>{slogan}</Text> : null}
      {age ? (
        <Text style={styles.metaLine}>{t('movie.ageRating', { value: age })}</Text>
      ) : null}
      {length ? (
        <Text style={styles.metaLine}>{t('movie.lengthMin', { n: length })}</Text>
      ) : null}
      {kpSeasons && siteSeasonCount != null ? (
        <Text style={styles.metaLine}>
          {t('movie.kpSeasonsOverlay', { kp: kpSeasons, site: siteSeasonCount })}
        </Text>
      ) : null}
      {stills.length ? <Gallery stills={stills} /> : null}
    </View>
  );
}

function Gallery({ stills }: { stills: string[] }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{t('movie.gallery')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRow}>
        {stills.slice(0, 12).map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.relatedPoster} contentFit="cover" />
        ))}
      </ScrollView>
    </View>
  );
}

type ReviewProps = { extras: KinopoiskExtras | null };

export function ReviewsSection({ extras }: ReviewProps) {
  const reviews = extras?.reviews ?? [];
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!reviews.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.reviews')}</Text>
      {reviews.map((review) => {
        const shown = !!open[review.reviewId];
        return (
          <View key={review.reviewId} style={styles.factCard}>
            <Pressable onPress={() => setOpen((s) => ({ ...s, [review.reviewId]: !shown }))}>
              <Text style={styles.factSpoiler}>
                {shown ? t('movie.hideReview') : t('movie.showReview')}
              </Text>
            </Pressable>
            {shown ? <Text style={styles.factText}>{review.description}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
