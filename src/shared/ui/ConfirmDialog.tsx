import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/src/shared/theme';
import { t } from '@/src/shared/i18n';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-screen overlay dialog — avoids RN Modal/Android window focus bugs. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = t('common.ok'),
  cancelLabel = t('common.cancel'),
  destructive = false,
  confirmOnly = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          {confirmOnly ? null : (
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>{cancelLabel}</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.btn, destructive ? styles.btnDanger : styles.btnPrimary]}
            onPress={onConfirm}
          >
            <Text style={destructive ? styles.btnDangerText : styles.btnPrimaryText}>
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  btn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnPrimaryText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: colors.danger,
  },
  btnDangerText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
