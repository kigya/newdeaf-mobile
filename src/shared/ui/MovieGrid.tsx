import { ActivityIndicator, FlatList, Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { MovieSummary } from '@/src/data/catalog/types';
import { useBreakpoint } from '@/src/shared/hooks/useBreakpoint';
import { t } from '@/src/shared/i18n';
import { colors, spacing } from '@/src/shared/theme';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

import { EmptyState } from './EmptyState';
import { MovieCard } from './MovieCard';

type Props = {
  movies: MovieSummary[];
  loading?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  ListHeaderComponent?: React.ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScrollBeginDrag?: () => void;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  forceSeries?: boolean;
  isDownloaded?: (movieId: string) => boolean;
  getWatchProgress?: (movieId: string) => WatchProgressRecord | undefined;
  onLongPressMovie?: (movie: MovieSummary) => void;
};

export function MovieGrid({
  movies,
  loading,
  loadingMore,
  onEndReached,
  emptyTitle = t('grid.emptyTitle'),
  emptySubtitle = t('grid.emptySubtitle'),
  ListHeaderComponent,
  refreshing,
  onRefresh,
  onScrollBeginDrag,
  keyboardShouldPersistTaps = 'handled',
  forceSeries,
  isDownloaded,
  getWatchProgress,
  onLongPressMovie,
}: Props) {
  const { width, columns } = useBreakpoint();
  const gap = spacing.md;
  const horizontalPad = spacing.lg;
  const cardWidth = (width - horizontalPad * 2 - gap * (columns - 1)) / columns;
  const router = useRouter();

  const listEmpty =
    loading && movies.length === 0 ? (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    ) : !loading && movies.length === 0 ? (
      <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
    ) : null;

  // Always use FlatList when a header is provided so rail/banner stay visible while loading.
  if (!ListHeaderComponent && loading && movies.length === 0) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!ListHeaderComponent && !loading && movies.length === 0) {
    return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />;
  }

  return (
    <FlatList
      data={movies}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      contentContainerStyle={styles.content}
      columnWrapperStyle={columns > 1 && movies.length > 0 ? { gap } : undefined}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={listEmpty}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={() => {
        Keyboard.dismiss();
        onScrollBeginDrag?.();
      }}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <MovieCard
          movie={item}
          index={index}
          width={cardWidth}
          forceSeries={forceSeries}
          showDownloaded={isDownloaded?.(item.id)}
          watchProgress={getWatchProgress?.(item.id)}
          onLongPress={onLongPressMovie ? () => onLongPressMovie(item) : undefined}
          onPress={() => {
            Keyboard.dismiss();
            router.push({
              pathname: '/movie/[id]',
              params: {
                id: item.id,
                href: item.href,
                title: item.title,
                posterUrl: item.posterUrl ?? '',
              },
            });
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  footer: {
    paddingVertical: spacing.xl,
  },
});
