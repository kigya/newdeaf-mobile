import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { colors, fonts, spacing, typography } from '@/src/shared/theme';

type Props = {
  title: string;
  subtitle?: string;
  compact?: boolean;
};

export function EmptyState({ title, subtitle, compact }: Props) {
  return (
    <Pressable style={[styles.flex, compact && styles.flexCompact]} onPress={Keyboard.dismiss}>
      <MotiView
        from={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 350 }}
        style={[styles.wrap, compact && styles.wrapCompact]}
      >
        <View style={styles.dot} />
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </MotiView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexCompact: {
    flexGrow: 0,
  },
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 80,
  },
  wrapCompact: {
    flexGrow: 0,
    justifyContent: 'flex-start',
    paddingTop: spacing.xl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
