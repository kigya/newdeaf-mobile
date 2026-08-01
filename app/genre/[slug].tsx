import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { fetchGenreMovies } from '@/src/data/catalog/catalog';
import type { MovieSummary } from '@/src/data/catalog/types';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { t } from '@/src/shared/i18n';
import { colors, fonts, spacing } from '@/src/shared/theme';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';

export default function GenreMoviesScreen() {
  const { slug, href, name } = useLocalSearchParams<{
    slug: string;
    href?: string;
    name?: string;
  }>();
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const requestIdRef = useRef(0);

  const genreHref = href || `/${slug}/`;
  const forceSeries = slug === 'serialy';

  const load = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const reqId = ++requestIdRef.current;
      try {
        if (mode === 'replace') setError(null);
        const result = await fetchGenreMovies(genreHref, targetPage);
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
        setError(e instanceof Error ? e.message : t('common.loadingError'));
        if (mode === 'replace') setMovies([]);
      }
    },
    [genreHref]
  );

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

  const visible = useMemo(() => {
    if (!forceSeries) return movies;
    return movies.map((m) => (m.isSeries ? m : { ...m, isSeries: true }));
  }, [movies, forceSeries]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: name ?? slug }} />
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
        movies={visible}
        loading={loading}
        loadingMore={loadingMore}
        refreshing={refreshing}
        forceSeries={forceSeries}
        getWatchProgress={getWatchProgress}
        onRefresh={() => {
          setRefreshing(true);
          void load(1, 'replace').finally(() => setRefreshing(false));
        }}
        onEndReached={() => {
          if (!hasMore || loadingMore || loading || refreshing || error) return;
          setLoadingMore(true);
          void load(page + 1, 'append').finally(() => setLoadingMore(false));
        }}
        emptyTitle={error ? t('common.loadingError') : t('genres.emptyTitle')}
        emptySubtitle={error ? error : t('genres.emptySubtitle')}
      />
    </View>
  );
}
