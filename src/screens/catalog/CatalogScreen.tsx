import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { fetchHomeMovies } from '@/src/data/catalog/catalog';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { ContinueWatchingRail } from '@/src/shared/ui/ContinueWatchingRail';
import { GenresBanner } from '@/src/shared/ui/GenresBanner';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { Screen } from '@/src/shared/ui/Screen';
import { t } from '@/src/shared/i18n';
import { usePaginatedMovies } from '@/src/shared/lib/usePaginatedMovies';
import { colors, fonts, spacing } from '@/src/shared/theme';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

export default function CatalogScreen() {
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const clearById = useWatchProgressStore((s) => s.clearById);
  const [pendingRemove, setPendingRemove] = useState<WatchProgressRecord | null>(null);

  const fetchPage = useCallback((page: number) => fetchHomeMovies(page), []);
  const { movies, loading, loadingMore, refreshing, error, refresh, loadMore } =
    usePaginatedMovies(fetchPage, { loadErrorFallback: t('catalog.loadError') });

  const listHeader = useMemo(
    () => (
      <View style={{ marginHorizontal: -spacing.lg }}>
        <ContinueWatchingRail onRequestRemove={setPendingRemove} />
        <GenresBanner />
      </View>
    ),
    []
  );

  return (
    <Screen title={t('catalog.title')} subtitle={t('catalog.subtitle')}>
      {error ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: fonts.medium,
            paddingHorizontal: spacing.lg,
            marginBottom: spacing.sm,
          }}
        >
          {error}
        </Text>
      ) : null}
      <View style={{ flex: 1 }}>
        <MovieGrid
          movies={movies}
          loading={loading}
          loadingMore={loadingMore}
          refreshing={refreshing}
          getWatchProgress={getWatchProgress}
          ListHeaderComponent={listHeader}
          onRefresh={refresh}
          onEndReached={loadMore}
          emptyTitle={t('catalog.emptyTitle')}
          emptySubtitle={t('catalog.emptySubtitle')}
        />
        <ConfirmDialog
          visible={!!pendingRemove}
          title={t('catalog.removeContinueTitle')}
          message={
            pendingRemove
              ? t('catalog.removeContinueMessage', { title: pendingRemove.title })
              : undefined
          }
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={() => {
            const id = pendingRemove?.id;
            setPendingRemove(null);
            if (id) void clearById(id);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      </View>
    </Screen>
  );
}
