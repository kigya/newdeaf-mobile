import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes } from '@/src/features/downloads/storage';
import { formatHoursWatched, type LibraryStats as Stats } from '@/src/features/stats/computeStats';
import { t } from '@/src/shared/i18n';
import { colors, fonts, radius, spacing, typography } from '@/src/shared/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type TileId = 'hours' | 'completed' | 'favorites' | 'downloads';

type Tile = {
  id: TileId;
  icon: IconName;
  value: string;
  label: string;
  a11y: string;
};

type Props = {
  stats: Stats;
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onOpenDownloads: () => void;
};

function tilesFor(stats: Stats): Tile[] {
  const hours = formatHoursWatched(stats.hoursWatched);
  const size = formatBytes(stats.downloadsBytes);
  return [
    {
      id: 'hours',
      icon: 'time-outline',
      value: hours,
      label: t('favorites.statHours'),
      a11y: t('favorites.statsHours', { n: hours }),
    },
    {
      id: 'completed',
      icon: 'checkmark-circle-outline',
      value: String(stats.completedCount),
      label: t('favorites.statFinished'),
      a11y: t('favorites.statsCompleted', { n: stats.completedCount }),
    },
    {
      id: 'favorites',
      icon: 'heart-outline',
      value: String(stats.favoritesCount),
      label: t('favorites.statSaved'),
      a11y: t('favorites.statsFavorites', { n: stats.favoritesCount }),
    },
    {
      id: 'downloads',
      icon: 'download-outline',
      value: size,
      label: t('favorites.statOffline'),
      a11y: t('favorites.statsDownloads', { size }),
    },
  ];
}

export function LibraryStats({
  stats,
  onOpenHistory,
  onOpenFavorites,
  onOpenDownloads,
}: Props) {
  const tiles = tilesFor(stats);

  const onPressTile = (id: TileId) => {
    const handlers: Record<TileId, () => void> = {
      hours: onOpenHistory,
      completed: onOpenHistory,
      favorites: onOpenFavorites,
      downloads: onOpenDownloads,
    };
    handlers[id]();
  };

  const rows = [tiles.slice(0, 2), tiles.slice(2, 4)];

  return (
    <View style={styles.wrap} testID="library-stats">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((tile, colIndex) => (
            <StatTile
              key={tile.id}
              tile={tile}
              index={rowIndex * 2 + colIndex}
              onPress={onPressTile}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function StatTile({
  tile,
  index,
  onPress,
}: {
  tile: Tile;
  index: number;
  onPress: (id: TileId) => void;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220, delay: index * 40 }}
      style={styles.tileMotion}
    >
      <Pressable
        testID={`library-stat-${tile.id}`}
        accessibilityRole="button"
        accessibilityLabel={tile.a11y}
        onPress={() => onPress(tile.id)}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        <View style={styles.iconWell}>
          <Ionicons name={tile.icon} size={16} color={colors.accent} />
        </View>
        <Text style={styles.value} numberOfLines={1}>
          {tile.value}
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          {tile.label}
        </Text>
      </Pressable>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tileMotion: {
    flex: 1,
  },
  tile: {
    minHeight: spacing.xxxl + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tilePressed: {
    opacity: 0.82,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.title,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
