import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ContinueWatchingRail } from '@/src/shared/ui/ContinueWatchingRail';
import { GenresBanner } from '@/src/shared/ui/GenresBanner';
import { MovieRail } from '@/src/shared/ui/MovieRail';
import { RailSkeleton } from '@/src/shared/ui/RailSkeleton';
import { useDiscoveryStore } from '@/src/features/discovery/store';
import { t } from '@/src/shared/i18n';
import { colors, fonts, spacing } from '@/src/shared/theme';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

type Props = {
  onRequestRemove: (item: WatchProgressRecord) => void;
  onLucky: () => void;
};

export function CatalogRails({ onRequestRemove, onLucky }: Props) {
  const hydrated = useDiscoveryStore((s) => s.hydrated);
  const refreshing = useDiscoveryStore((s) => s.refreshing);
  const rails = useDiscoveryStore((s) => s.rails);
  const refreshStale = useDiscoveryStore((s) => s.refreshStale);

  useEffect(() => {
    void refreshStale();
  }, [refreshStale]);

  const popular = rails['site-popular']?.items ?? [];
  const because = rails['because-you-watched']?.items ?? [];
  const top = rails['kp-top-250']?.items ?? [];
  const premieres = rails['kp-premieres']?.items ?? [];
  const trending = rails['tmdb-trending']?.items ?? [];
  const fantastic = rails['genre-fantastic']?.items ?? [];
  const serials = rails['genre-serials']?.items ?? [];
  const showSkeleton = (!hydrated || refreshing) && !popular.length && !top.length;

  return (
    <View>
      <Pressable onPress={onLucky} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.semiBold,
            fontSize: 15,
          }}
        >
          {t('catalog.lucky')}
        </Text>
      </Pressable>
      <ContinueWatchingRail onRequestRemove={onRequestRemove} />
      {showSkeleton ? <RailSkeleton /> : null}
      <MovieRail title={t('catalog.popular')} items={popular} testID="rail-popular" />
      <MovieRail title={t('catalog.becauseYouWatched')} items={because} />
      <MovieRail title={t('catalog.kpTop250')} items={top} />
      <MovieRail title={t('catalog.premieres')} items={premieres} />
      <MovieRail title={t('catalog.trending')} items={trending} />
      <MovieRail title={t('catalog.genreFantastic')} items={fantastic} />
      <MovieRail title={t('catalog.genreSerials')} items={serials} />
      <GenresBanner />
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.semiBold,
          fontSize: 17,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        }}
      >
        {t('catalog.newReleases')}
      </Text>
    </View>
  );
}
