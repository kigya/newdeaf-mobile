import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/src/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Не найдено' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Этого экрана нет</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>На главную</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  link: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkText: {
    fontSize: 15,
    color: colors.accent,
    fontFamily: fonts.medium,
  },
});
