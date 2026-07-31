import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { fetchGenreMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { t } from '@/src/i18n';
import { colors } from '@/src/theme';
import { useWatchProgressStore } from '@/src/watch-progress/store';

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
  const [hasMore, setHasMore] = useState(true);

  const genreHref = href || `/${slug}/`;
  const forceSeries = slug === 'serialy';

  const load = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const result = await fetchGenreMovies(genreHref, targetPage);
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
      <MovieGrid
        movies={visible}
        loading={loading}
        loadingMore={loadingMore}
        forceSeries={forceSeries}
        getWatchProgress={getWatchProgress}
        onEndReached={() => {
          if (!hasMore || loadingMore || loading) return;
          setLoadingMore(true);
          void load(page + 1, 'append').finally(() => setLoadingMore(false));
        }}
        emptyTitle={t('genres.emptyTitle')}
        emptySubtitle={t('genres.emptySubtitle')}
      />
    </View>
  );
}
