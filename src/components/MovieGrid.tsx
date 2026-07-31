import { ActivityIndicator, FlatList, Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { MovieSummary } from '@/src/api/types';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { t } from '@/src/i18n';
import { colors, spacing } from '@/src/theme';

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
  onLongPressMovie,
}: Props) {
  const { width, columns } = useBreakpoint();
  const gap = spacing.md;
  const horizontalPad = spacing.lg;
  const cardWidth = (width - horizontalPad * 2 - gap * (columns - 1)) / columns;
  const router = useRouter();

  if (loading && movies.length === 0) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!loading && movies.length === 0) {
    return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />;
  }

  return (
    <FlatList
      data={movies}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      contentContainerStyle={styles.content}
      columnWrapperStyle={columns > 1 ? { gap } : undefined}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={ListHeaderComponent}
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
