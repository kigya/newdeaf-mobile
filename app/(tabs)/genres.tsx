import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getGenres } from '@/src/api/catalog';
import { Screen } from '@/src/components/Screen';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';

export default function GenresScreen() {
  const genres = getGenres();
  const router = useRouter();
  const { columns, width } = useBreakpoint();
  const gap = spacing.md;
  const pad = spacing.lg;
  const colCount = Math.min(columns, 3);
  const itemWidth = (width - pad * 2 - gap * (colCount - 1)) / colCount;

  return (
    <Screen title={t('genres.title')} subtitle={t('genres.subtitle')}>
      <FlatList
        data={genres}
        key={colCount}
        numColumns={colCount}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: spacing.xxxl, gap }}
        columnWrapperStyle={colCount > 1 ? { gap } : undefined}
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: Math.min(index * 30, 300), type: 'timing', duration: 350 }}
            style={{ width: itemWidth }}
          >
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() =>
                router.push({
                  pathname: '/genre/[slug]',
                  params: { slug: item.slug, href: item.href, name: item.name },
                })
              }
            >
              <View style={styles.accent} />
              <Text style={styles.name}>{item.name}</Text>
            </Pressable>
          </MotiView>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
    padding: spacing.md,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
});
