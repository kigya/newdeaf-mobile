import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import type { KinopoiskEnrichment } from '@/src/data/catalog/kinopoisk';
import type { MovieDetail } from '@/src/data/catalog/types';
import { useBreakpoint } from '@/src/shared/hooks/useBreakpoint';
import { t } from '@/src/shared/i18n';
import { colors } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type HeroSectionProps = {
  movie: MovieDetail;
  isSerial: boolean;
  kp: KinopoiskEnrichment | null;
};

export function HeroSection({ movie, isSerial, kp }: HeroSectionProps) {
  const { isTablet, width } = useBreakpoint();
  const posterWidth = isTablet ? Math.min(280, width * 0.28) : Math.min(160, width * 0.38);
  const posterHeight = posterWidth * 1.48;

  return (
    <View style={[styles.hero, isTablet && styles.heroTablet]}>
      <View style={{ width: posterWidth, height: posterHeight }}>
        {movie.posterUrl ? (
          <Image
            source={{ uri: movie.posterUrl }}
            style={styles.poster}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.poster, styles.posterFallback]}>
            <Text style={styles.posterLetter}>{movie.title.slice(0, 1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.heroMeta}>
        <Text style={styles.title}>{movie.title}</Text>
        {isSerial ? (
          <View style={styles.serialBadge}>
            <Text style={styles.serialBadgeText}>{t('movie.serial')}</Text>
          </View>
        ) : null}
        <View style={styles.ratings}>
          {movie.kpRating ? (
            <View style={[styles.rating, { backgroundColor: colors.kp }]}>
              <Text style={styles.ratingText}>KP {movie.kpRating}</Text>
            </View>
          ) : null}
          {movie.imdbRating ? (
            <View style={[styles.rating, { backgroundColor: colors.imdb }]}>
              <Text style={[styles.ratingText, { color: colors.black }]}>
                IMDb {movie.imdbRating}
              </Text>
            </View>
          ) : null}
        </View>
        {kp?.awards?.length ? (
          <View style={styles.awardChips}>
            {kp.awards.map((award) => (
              <View key={award.name} style={styles.awardChip}>
                <Text style={styles.awardChipText}>{award.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {movie.year || movie.country || movie.duration ? (
          <Text style={styles.metaLine}>
            {[movie.year, movie.country, movie.duration].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {movie.director ? (
          <Text style={styles.metaLine}>{t('movie.director', { name: movie.director })}</Text>
        ) : null}
        {movie.genres.length ? (
          <Text style={styles.metaLine}>
            {t('movie.genre', { list: movie.genres.join(', ') })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
