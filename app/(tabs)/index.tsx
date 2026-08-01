import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { fetchHomeMovies } from '@/src/data/catalog/catalog';
import type { MovieSummary } from '@/src/data/catalog/types';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { ContinueWatchingRail } from '@/src/shared/ui/ContinueWatchingRail';
import { GenresBanner } from '@/src/shared/ui/GenresBanner';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { Screen } from '@/src/shared/ui/Screen';
import { t } from '@/src/shared/i18n';
import { colors, fonts, spacing } from '@/src/shared/theme';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

export default function CatalogScreen() {
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const clearById = useWatchProgressStore((s) => s.clearById);
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pendingRemove, setPendingRemove] = useState<WatchProgressRecord | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (targetPage: number, mode: 'replace' | 'append') => {
    const reqId = ++requestIdRef.current;
    try {
      if (mode === 'replace') setError(null);
      const result = await fetchHomeMovies(targetPage);
      if (reqId !== requestIdRef.current) return;

      let appended = 0;
      setMovies((prev) => {
        if (mode === 'replace') return result.items;
        const seen = new Set(prev.map((m) => m.id));
        const next = result.items.filter((m) => !seen.has(m.id));
        appended = next.length;
        return [...prev, ...next];
      });
      if (mode === 'append' && appended === 0) {
        setHasMore(false);
      } else {
        setHasMore(result.hasMore);
      }
      setPage(targetPage);
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : t('catalog.loadError'));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

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
          onRefresh={() => {
            setRefreshing(true);
            void load(1, 'replace').finally(() => setRefreshing(false));
          }}
          onEndReached={() => {
            if (!hasMore || loadingMore || loading || refreshing) return;
            setLoadingMore(true);
            void load(page + 1, 'append').finally(() => setLoadingMore(false));
          }}
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
