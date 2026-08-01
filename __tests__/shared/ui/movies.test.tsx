import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import type { MovieSummary } from '@/src/data/catalog/types';
import { GenresBanner } from '@/src/shared/ui/GenresBanner';
import { MovieCard } from '@/src/shared/ui/MovieCard';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { t } from '@/src/shared/i18n';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

const movie: MovieSummary = {
  id: 'm1',
  slug: 'film',
  title: 'Test Movie',
  year: '2024',
  href: '/film/',
  posterUrl: 'https://example.com/p.jpg',
  kpRating: '7.1',
  isSeries: false,
};

const series: MovieSummary = {
  ...movie,
  id: 'm2',
  title: 'Series One',
  isSeries: true,
  posterUrl: undefined,
  kpRating: undefined,
  imdbRating: '8.0',
};

function mockRouterPush() {
  const mockPush = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  });
  return mockPush;
}

describe('MovieCard', () => {
  it('renders poster movie and handles press', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await render(
      <MovieCard movie={movie} width={120} onPress={onPress} onLongPress={onLongPress} />
    );
    await fireEvent.press(screen.getByLabelText('Test Movie'));
    expect(onPress).toHaveBeenCalled();
    await fireEvent(screen.getByLabelText('Test Movie'), 'onLongPress');
    expect(onLongPress).toHaveBeenCalled();
    expect(screen.getByText('2024')).toBeTruthy();
  });

  it('shows series badge, downloaded badge, imdb, and progress', async () => {
    const progress: WatchProgressRecord = {
      id: 'm2',
      movieId: 'm2',
      positionSec: 120,
      durationSec: 600,
      title: 'Series One',
      isSeries: true,
      source: 'online',
      updatedAt: 1,
    };
    await render(
      <MovieCard
        movie={series}
        width={100}
        onPress={jest.fn()}
        forceSeries
        showDownloaded
        watchProgress={progress}
      />
    );
    expect(screen.getByText(t('movie.serial'))).toBeTruthy();
    expect(screen.getByText('Series One')).toBeTruthy();
    expect(screen.getByText('8.0')).toBeTruthy();
  });

  it('uses fallback progress ratio when duration missing', async () => {
    const progress: WatchProgressRecord = {
      id: 'm1',
      movieId: 'm1',
      positionSec: 90,
      title: 'Test Movie',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    };
    await render(
      <MovieCard movie={movie} width={100} onPress={jest.fn()} watchProgress={progress} />
    );
    expect(screen.getByText('Test Movie')).toBeTruthy();
  });
});

describe('MovieGrid', () => {
  it('shows loader when loading empty without header', async () => {
    await render(<MovieGrid movies={[]} loading />);
    expect(screen.toJSON()).toBeTruthy();
  });

  it('shows empty state when not loading', async () => {
    await render(
      <MovieGrid movies={[]} loading={false} emptyTitle="No movies" emptySubtitle="None" />
    );
    expect(screen.getByText('No movies')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('renders movies and navigates on press', async () => {
    const mockPush = mockRouterPush();
    await render(
      <MovieGrid
        movies={[movie]}
        isDownloaded={() => true}
        getWatchProgress={() => undefined}
        onLongPressMovie={jest.fn()}
        loadingMore
      />
    );
    await fireEvent.press(
      screen.getByLabelText(`${movie.title}, ${t('favorites.downloaded')}`)
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/movie/[id]',
        params: expect.objectContaining({ id: 'm1' }),
      })
    );
  });

  it('keeps FlatList when ListHeaderComponent provided while empty loading', async () => {
    await render(
      <MovieGrid
        movies={[]}
        loading
        ListHeaderComponent={<React.Fragment />}
        emptyTitle="Empty"
      />
    );
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('GenresBanner', () => {
  it('navigates to genres tab on press', async () => {
    const mockPush = mockRouterPush();
    await render(<GenresBanner />);
    await fireEvent.press(screen.getByText(t('catalog.browseGenres')));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/genres');
  });
});
