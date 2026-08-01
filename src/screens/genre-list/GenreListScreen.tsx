import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';

import { fetchGenreMovies } from '@/src/data/catalog/catalog';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { t } from '@/src/shared/i18n';
import { usePaginatedMovies } from '@/src/shared/lib/usePaginatedMovies';
import { colors, fonts, spacing } from '@/src/shared/theme';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';

export default function GenreMoviesScreen() {
  const { slug, href, name } = useLocalSearchParams<{
    slug: string;
    href?: string;
    name?: string;
  }>();
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);

  const genreHref = href || `/${slug}/`;
  const forceSeries = slug === 'serialy';

  const fetchPage = useCallback(
    (page: number) => fetchGenreMovies(genreHref, page),
    [genreHref]
  );
  const { movies, loading, loadingMore, refreshing, error, refresh, loadMore } =
    usePaginatedMovies(fetchPage, {
      loadErrorFallback: t('common.loadingError'),
      clearOnReplaceError: true,
      blockLoadMoreWhenError: true,
    });

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
        onRefresh={refresh}
        onEndReached={loadMore}
        emptyTitle={error ? t('common.loadingError') : t('genres.emptyTitle')}
        emptySubtitle={error ? error : t('genres.emptySubtitle')}
      />
    </View>
  );
}
