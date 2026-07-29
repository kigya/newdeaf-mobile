import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { fetchGenreMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { colors } from '@/src/theme';

export default function GenreMoviesScreen() {
  const { slug, href, name } = useLocalSearchParams<{
    slug: string;
    href?: string;
    name?: string;
  }>();
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const genreHref = href || `/${slug}/`;

  const load = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const items = await fetchGenreMovies(genreHref, targetPage);
      setHasMore(items.length >= 12);
      setMovies((prev) => {
        if (mode === 'replace') return items;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...items.filter((m) => !seen.has(m.id))];
      });
      setPage(targetPage);
    },
    [genreHref]
  );

  useEffect(() => {
    setLoading(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: name ?? slug }} />
      <MovieGrid
        movies={movies}
        loading={loading}
        loadingMore={loadingMore}
        onEndReached={() => {
          if (!hasMore || loadingMore || loading) return;
          setLoadingMore(true);
          void load(page + 1, 'append').finally(() => setLoadingMore(false));
        }}
        emptyTitle="В жанре пусто"
        emptySubtitle="Попробуйте другой жанр"
      />
    </View>
  );
}
