import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { fetchHomeMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { Screen } from '@/src/components/Screen';
import { t } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';

export default function CatalogScreen() {
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (targetPage: number, mode: 'replace' | 'append') => {
    try {
      if (mode === 'replace') setError(null);
      const result = await fetchHomeMovies(targetPage);

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
      setError(e instanceof Error ? e.message : t('catalog.loadError'));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

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
          onRefresh={() => {
            setRefreshing(true);
            void load(1, 'replace').finally(() => setRefreshing(false));
          }}
          onEndReached={() => {
            if (!hasMore || loadingMore || loading) return;
            setLoadingMore(true);
            void load(page + 1, 'append').finally(() => setLoadingMore(false));
          }}
          emptyTitle={t('catalog.emptyTitle')}
          emptySubtitle={t('catalog.emptySubtitle')}
        />
      </View>
    </Screen>
  );
}
