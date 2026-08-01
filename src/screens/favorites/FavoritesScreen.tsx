import { useState } from 'react';
import { View } from 'react-native';

import type { MovieSummary } from '@/src/data/catalog/types';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { Screen } from '@/src/shared/ui/Screen';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { isMovieDownloaded } from '@/src/features/favorites/downloaded';
import { useFavoritesStore } from '@/src/features/favorites/store';
import { t } from '@/src/shared/i18n';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';

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
          const id = pendingRemove!.id;
          void remove(id);
          setPendingRemove(null);
        }}
      />
    </Screen>
  );
}
