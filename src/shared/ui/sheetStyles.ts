import { StyleSheet } from 'react-native';

import { colors, fonts, radius, spacing } from '@/src/shared/theme';

/**
 * Shared chrome for DownloadSheet and YoutubeDownloadSheet.
 * Only keys that are pixel-identical in both sheets live here;
 * divergent keys (sheet maxHeight, title, section, chips, chip, chipText, warn, …)
 * stay local so look/behavior is unchanged.
 */
export const sheetStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipTextActive: {
    color: colors.accent,
  },
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
