import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/shared/i18n';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

/** Accent banner on Catalog that opens the genres picker. */
export function GenresBanner() {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      onPress={() => router.push('/(tabs)/genres')}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="grid-outline" size={22} color={colors.black} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('catalog.browseGenres')}</Text>
        <Text style={styles.sub}>{t('catalog.browseGenresSub')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.black} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  sub: {
    marginTop: 2,
    color: 'rgba(0,0,0,0.7)',
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
