import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MovieSummary } from '@/src/api/types';
import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';

type Props = {
  movie: MovieSummary;
  index?: number;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  forceSeries?: boolean;
  showDownloaded?: boolean;
};

export function MovieCard({
  movie,
  index = 0,
  width,
  onPress,
  onLongPress,
  forceSeries,
  showDownloaded,
}: Props) {
  const height = Math.round(width * 1.48);
  const showSeries = forceSeries || Boolean(movie.isSeries);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420, delay: Math.min(index * 40, 320) }}
      style={{ width }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={380}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={
          showDownloaded
            ? `${movie.title}, ${t('favorites.downloaded')}`
            : movie.title
        }
      >
        <View style={[styles.posterWrap, { height }]}>
          {movie.posterUrl ? (
            <Image
              source={{ uri: movie.posterUrl }}
              style={styles.poster}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.poster, styles.posterFallback]}>
              <Text style={styles.fallbackText}>{movie.title.slice(0, 1)}</Text>
            </View>
          )}
          {showSeries ? (
            <View style={styles.seriesBadge}>
              <Text style={styles.seriesBadgeText}>{t('movie.serial')}</Text>
            </View>
          ) : null}
          {showDownloaded ? (
            <View style={styles.downloadedBadge} accessibilityElementsHidden>
              <Ionicons name="download" size={12} color={colors.black} />
            </View>
          ) : null}
          {(movie.kpRating || movie.imdbRating) && (
            <View style={styles.badges}>
              {movie.kpRating ? (
                <View style={[styles.badge, styles.kp]}>
                  <Text style={styles.badgeText}>{movie.kpRating}</Text>
                </View>
              ) : movie.imdbRating ? (
                <View style={[styles.badge, styles.imdb]}>
                  <Text style={[styles.badgeText, styles.imdbText]}>{movie.imdbRating}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        {movie.year ? <Text style={styles.year}>{movie.year}</Text> : null}
      </Pressable>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  posterWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  fallbackText: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 36,
  },
  seriesBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.accent,
  },
  seriesBadgeText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  downloadedBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: colors.accent,
  },
  badges: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kp: {
    backgroundColor: colors.kp,
  },
  imdb: {
    backgroundColor: colors.imdb,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  imdbText: {
    color: colors.black,
  },
  title: {
    marginTop: spacing.sm,
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  year: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
});
