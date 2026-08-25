import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { MovieSummary } from '@/src/data/catalog/types';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { Screen } from '@/src/shared/ui/Screen';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { computeDownloadsUsage } from '@/src/features/downloads/storage';
import { isMovieDownloaded } from '@/src/features/favorites/downloaded';
import { useFavoritesStore } from '@/src/features/favorites/store';
import { BUILTIN_QUEUE_ID, BUILTIN_REWATCH_ID, type ListRecord } from '@/src/features/lists/types';
import { useListsStore } from '@/src/features/lists/store';
import { computeStats } from '@/src/features/stats/computeStats';
import { useWatchHistoryStore } from '@/src/features/watch-history/store';
import type { WatchHistoryRecord } from '@/src/features/watch-history/types';
import { t } from '@/src/shared/i18n';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

import { LibraryStats } from './LibraryStats';

const BUILTIN_SEGMENTS: { id: string; labelKey: string }[] = [
  { id: 'favorites', labelKey: 'favorites.title' },
  { id: 'queue', labelKey: 'favorites.queue' },
  { id: 'rewatch', labelKey: 'favorites.rewatch' },
  { id: 'history', labelKey: 'favorites.history' },
];

function latestHistoryMovies(history: WatchHistoryRecord[]): MovieSummary[] {
  const byMovie = new Map<string, WatchHistoryRecord>();
  for (const row of history) {
    const prev = byMovie.get(row.movieId);
    if (!prev || row.watchedAt > prev.watchedAt) byMovie.set(row.movieId, row);
  }
  return [...byMovie.values()]
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .map((row) => ({
      id: row.movieId,
      slug: row.movieId,
      title:
        row.isSeries && row.season != null && row.episode != null
          ? `${row.title} — ${t('downloads.episodeBadge', { season: row.season, episode: row.episode })}`
          : row.title,
      posterUrl: row.posterUrl,
      href: row.href || `/${row.movieId}.html`,
      isSeries: row.isSeries,
    }));
}

function listIdForSegment(segment: string): string {
  if (segment === 'queue') return BUILTIN_QUEUE_ID;
  if (segment === 'rewatch') return BUILTIN_REWATCH_ID;
  return segment;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const items = useFavoritesStore((s) => s.items);
  const favoritesHydrated = useFavoritesStore((s) => s.hydrated);
  const removeFavorite = useFavoritesStore((s) => s.remove);
  const downloads = useDownloadsStore((s) => s.items);
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const listItems = useListsStore((s) => s.items);
  const lists = useListsStore((s) => s.lists);
  const listsHydrated = useListsStore((s) => s.hydrated);
  const removeListItem = useListsStore((s) => s.removeItem);
  const deleteList = useListsStore((s) => s.deleteList);
  const history = useWatchHistoryStore((s) => s.items);
  const historyHydrated = useWatchHistoryStore((s) => s.hydrated);
  const removeHistory = useWatchHistoryStore((s) => s.remove);
  const [segment, setSegment] = useState('favorites');
  const [pendingRemove, setPendingRemove] = useState<MovieSummary | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<ListRecord | null>(null);
  const [downloadBytes, setDownloadBytes] = useState(0);
  const downloadJobSig = downloads.map((d) => `${d.id}:${d.status}`).join('|');

  useEffect(() => {
    void computeDownloadsUsage().then(setDownloadBytes);
  }, [downloadJobSig]);

  const stats = useMemo(
    () =>
      computeStats({
        history,
        favoritesCount: items.length,
        downloadsBytes: downloadBytes,
      }),
    [history, items.length, downloadBytes]
  );

  const customLists = lists.filter((list) => list.kind === 'custom');
  const movies: MovieSummary[] =
    segment === 'favorites'
      ? items
      : segment === 'queue'
        ? listItems.filter((i) => i.listId === BUILTIN_QUEUE_ID)
        : segment === 'rewatch'
          ? listItems.filter((i) => i.listId === BUILTIN_REWATCH_ID)
          : segment === 'history'
            ? latestHistoryMovies(history)
            : listItems.filter((i) => i.listId === segment);

  const emptyTitle =
    segment === 'favorites'
      ? t('favorites.emptyTitle')
      : segment === 'queue'
        ? t('favorites.queueEmpty')
        : segment === 'rewatch'
          ? t('favorites.rewatchEmpty')
          : segment === 'history'
            ? t('favorites.historyEmpty')
            : t('favorites.queueEmpty');
  const emptySubtitle =
    segment === 'favorites'
      ? t('favorites.emptySubtitle')
      : segment === 'history'
        ? t('favorites.historyEmptySub')
        : t('favorites.queueEmptySub');

  const loading =
    segment === 'favorites'
      ? !favoritesHydrated
      : segment === 'history'
        ? !historyHydrated
        : !listsHydrated;

  const removeTitle =
    segment === 'favorites'
      ? t('favorites.deleteTitle')
      : segment === 'history'
        ? t('favorites.removeHistoryTitle')
        : t('favorites.removeListTitle');
  const removeMessage = pendingRemove
    ? segment === 'favorites'
      ? t('favorites.deleteMessage', { title: pendingRemove.title })
      : segment === 'history'
        ? t('favorites.removeHistoryMessage', { title: pendingRemove.title })
        : t('favorites.removeListMessage', { title: pendingRemove.title })
    : undefined;

  const confirmRemove = () => {
    const pending = pendingRemove!;
    if (segment === 'favorites') {
      void removeFavorite(pending.id);
    } else if (segment === 'history') {
      for (const row of history.filter((h) => h.movieId === pending.id)) {
        void removeHistory(row.id);
      }
    } else {
      void removeListItem(listIdForSegment(segment), pending.id);
    }
    setPendingRemove(null);
  };

  const confirmDeleteList = () => {
    const list = pendingDeleteList!;
    void deleteList(list.id);
    if (segment === list.id) setSegment('favorites');
    setPendingDeleteList(null);
  };

  return (
    <Screen title={t('tabs.library')}>
      <LibraryStats
        stats={stats}
        onOpenHistory={() => setSegment('history')}
        onOpenFavorites={() => setSegment('favorites')}
        onOpenDownloads={() => router.push('/(tabs)/downloads')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.segmentsScroll}
        contentContainerStyle={styles.segments}
      >
        {BUILTIN_SEGMENTS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSegment(s.id)}
            style={[styles.seg, segment === s.id && styles.segActive]}
          >
            <Text style={[styles.segText, segment === s.id && styles.segTextActive]}>
              {t(s.labelKey)}
            </Text>
          </Pressable>
        ))}
        {customLists.map((list) => (
          <Pressable
            key={list.id}
            testID={`library-list-chip-${list.id}`}
            onPress={() => setSegment(list.id)}
            onLongPress={() => setPendingDeleteList(list)}
            delayLongPress={450}
            style={[styles.seg, segment === list.id && styles.segActive]}
            accessibilityHint={t('favorites.deleteListA11y', { name: list.name })}
          >
            <Text style={[styles.segText, segment === list.id && styles.segTextActive]}>
              {list.name}
            </Text>
            <Pressable
              testID={`library-list-delete-${list.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('favorites.deleteListA11y', { name: list.name })}
              onPress={() => setPendingDeleteList(list)}
              hitSlop={8}
              style={styles.segDelete}
            >
              <Ionicons
                name="close"
                size={14}
                color={segment === list.id ? colors.accent : colors.textMuted}
              />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.grid}>
        <MovieGrid
          movies={movies}
          loading={loading}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          emptyCompact
          isDownloaded={(movieId) => isMovieDownloaded(movieId, downloads)}
          getWatchProgress={getWatchProgress}
          onLongPressMovie={(movie) => setPendingRemove(movie)}
        />
      </View>
      <ConfirmDialog
        visible={Boolean(pendingRemove) && !pendingDeleteList}
        title={removeTitle}
        message={removeMessage}
        confirmLabel={t('common.delete')}
        destructive
        onCancel={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
      />
      <ConfirmDialog
        visible={Boolean(pendingDeleteList)}
        title={t('favorites.deleteListTitle')}
        message={
          pendingDeleteList
            ? t('favorites.deleteListMessage', { name: pendingDeleteList.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        destructive
        onCancel={() => setPendingDeleteList(null)}
        onConfirm={confirmDeleteList}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  segments: {
    flexGrow: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  seg: {
    minHeight: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  segDelete: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    backgroundColor: colors.accentSoft,
  },
  segText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  segTextActive: {
    color: colors.accent,
  },
  grid: {
    flex: 1,
  },
});
