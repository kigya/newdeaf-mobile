import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MovieSummary } from '@/src/data/catalog/types';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

const POSTER_W = 110;
const POSTER_H = Math.round(POSTER_W * 1.5);

type Props = {
  title: string;
  items: MovieSummary[];
  testID?: string;
};

export function MovieRail({ title, items, testID }: Props) {
  if (items.length < 3) return null;

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {items.map((item) => (
          <RailCard key={item.id} movie={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function RailCard({ movie }: { movie: MovieSummary }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/movie/[id]',
          params: {
            id: movie.id,
            href: movie.href,
            title: movie.title,
            posterUrl: movie.posterUrl,
          },
        })
      }
    >
      <View style={styles.posterWrap}>
        {movie.posterUrl ? (
          <Image source={{ uri: movie.posterUrl }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, styles.posterFallback]} />
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {movie.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 17,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: POSTER_W,
  },
  posterWrap: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    backgroundColor: colors.bgElevated,
  },
  cardTitle: {
    marginTop: spacing.xs,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});
