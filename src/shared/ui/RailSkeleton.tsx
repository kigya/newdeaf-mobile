import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/src/shared/theme';

const POSTER_W = 110;
const POSTER_H = Math.round(POSTER_W * 1.5);

type Props = {
  count?: number;
};

export function RailSkeleton({ count = 6 }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.heading} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.poster} />
            <View style={styles.line} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  heading: {
    height: 18,
    width: 140,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: POSTER_W,
  },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  line: {
    marginTop: spacing.xs,
    height: 10,
    width: POSTER_W * 0.8,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
  },
});
