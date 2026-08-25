import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MovieSummary } from '@/src/data/catalog/types';
import { BUILTIN_QUEUE_ID, BUILTIN_REWATCH_ID } from '@/src/features/lists/types';
import { useListsStore } from '@/src/features/lists/store';
import { t } from '@/src/shared/i18n';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

type Props = {
  visible: boolean;
  movie: MovieSummary | null;
  onClose: () => void;
};

function builtinLabel(id: string): string {
  if (id === BUILTIN_QUEUE_ID) return t('favorites.queue');
  if (id === BUILTIN_REWATCH_ID) return t('favorites.rewatch');
  return id;
}

export function ListPickerSheet({ visible, movie, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const lists = useListsStore((s) => s.lists);
  const isInList = useListsStore((s) => s.isInList);
  const toggleItem = useListsStore((s) => s.toggleItem);
  const createList = useListsStore((s) => s.createList);
  const [name, setName] = useState('');

  if (!visible || !movie) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.title}>{t('lists.add')}</Text>
        <ScrollView style={styles.scroll}>
          {lists.map((list) => {
            const active = isInList(list.id, movie.id);
            const label = list.kind === 'builtin' ? builtinLabel(list.id) : list.name;
            return (
              <Pressable
                key={list.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => void toggleItem(list.id, movie)}
              >
                <Text style={styles.rowText}>{label}</Text>
                <Text style={styles.rowHint}>{active ? t('lists.added') : t('lists.add')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.createRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('favorites.listName')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable
            style={styles.createBtn}
            onPress={() => {
              const trimmed = name.trim();
              if (!trimmed) return;
              void (async () => {
                const created = await createList(trimmed);
                await toggleItem(created.id, movie);
                setName('');
              })();
            }}
          >
            <Text style={styles.createText}>{t('lists.create')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.blackOverlay65,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '70%',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  scroll: {
    maxHeight: 280,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowActive: {
    opacity: 1,
  },
  rowText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
    flex: 1,
  },
  rowHint: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.regular,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createText: {
    color: colors.black,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
});
