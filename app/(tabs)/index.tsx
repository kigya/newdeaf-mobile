import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { fetchHomeMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { Screen } from '@/src/components/Screen';
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
      const items = await fetchHomeMovies(targetPage);
      setHasMore(items.length >= 12);
      setMovies((prev) => {
        if (mode === 'replace') return items;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...items.filter((m) => !seen.has(m.id))];
      });
      setPage(targetPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить каталог');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

  return (
    <Screen title="NewDeaf" subtitle="Фильмы с субтитрами">
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
        emptyTitle="Каталог пуст"
        emptySubtitle="Потяните вниз, чтобы обновить"
      />
    </Screen>
  );
}
