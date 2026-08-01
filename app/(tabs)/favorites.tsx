import { useState } from 'react';
import { View } from 'react-native';

import type { MovieSummary } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { MovieGrid } from '@/src/components/MovieGrid';
import { Screen } from '@/src/components/Screen';
import { useDownloadsStore } from '@/src/downloads/store';
import { isMovieDownloaded } from '@/src/favorites/downloaded';
import { useFavoritesStore } from '@/src/favorites/store';
import { t } from '@/src/i18n';
import { useWatchProgressStore } from '@/src/watch-progress/store';

export default function FavoritesScreen() {
  const items = useFavoritesStore((s) => s.items);
  const hydrated = useFavoritesStore((s) => s.hydrated);
  const remove = useFavoritesStore((s) => s.remove);
  const downloads = useDownloadsStore((s) => s.items);
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const [pendingRemove, setPendingRemove] = useState<MovieSummary | null>(null);

  return (
    <Screen title={t('favorites.title')} subtitle={t('favorites.subtitle')}>
      <View style={{ flex: 1 }}>
        <MovieGrid
          movies={items}
          loading={!hydrated}
          emptyTitle={t('favorites.emptyTitle')}
          emptySubtitle={t('favorites.emptySubtitle')}
          isDownloaded={(movieId) => isMovieDownloaded(movieId, downloads)}
          getWatchProgress={getWatchProgress}
          onLongPressMovie={(movie) => setPendingRemove(movie)}
        />
      </View>
      <ConfirmDialog
        visible={Boolean(pendingRemove)}
        title={t('favorites.deleteTitle')}
        message={
          pendingRemove
            ? t('favorites.deleteMessage', { title: pendingRemove.title })
            : undefined
        }
        confirmLabel={t('common.delete')}
        destructive
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) {
            void remove(pendingRemove.id);
          }
          setPendingRemove(null);
        }}
      />
    </Screen>
  );
}
