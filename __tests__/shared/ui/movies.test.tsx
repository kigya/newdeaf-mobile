import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

  it('renders without year and applies pressed style', async () => {
    const noYear = { ...movie, year: undefined, kpRating: undefined, imdbRating: undefined };
    const TestRenderer = require('react-test-renderer');
    let renderer: {
      root: {
        findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => { props: { style: (s: { pressed: boolean }) => unknown } }[];
      };
      unmount: () => void;
    };
    await act(async () => {
      renderer = TestRenderer.create(
        <MovieCard movie={noYear} width={100} onPress={jest.fn()} index={20} />
      );
    });
    const pressable = renderer!.root.findAll(
      (n) => typeof n.props?.style === 'function' && typeof n.props?.onPress === 'function'
    )[0];
    expect(pressable.props.style({ pressed: true })).toBeTruthy();
    expect(pressable.props.style({ pressed: false })).toBeTruthy();
    renderer!.unmount();
  });

  it('shows imdb when kp missing via ternary else', async () => {
    await render(
      <MovieCard
        movie={{ ...movie, kpRating: undefined, imdbRating: '8.8' }}
        width={100}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText('8.8')).toBeTruthy();
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

  it('shows compact empty and compact loader', async () => {
    const { rerender } = await render(
      <MovieGrid movies={[]} loading={false} emptyCompact emptyTitle="Compact empty" />
    );
    expect(screen.getByText('Compact empty')).toBeTruthy();
    await rerender(<MovieGrid movies={[]} loading emptyCompact emptyTitle="Compact empty" />);
    expect(screen.toJSON()).toBeTruthy();
  });

  it('renders movies and navigates on press', async () => {
    const mockPush = mockRouterPush();
    const onScrollBeginDrag = jest.fn();
    await render(
      <MovieGrid
        movies={[movie]}
        isDownloaded={() => true}
        getWatchProgress={() => undefined}
        onLongPressMovie={jest.fn()}
        loadingMore
        onScrollBeginDrag={onScrollBeginDrag}
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

  it('invokes long-press handler and empty posterUrl param', async () => {
    const mockPush = mockRouterPush();
    const onLongPressMovie = jest.fn();
    await render(
      <MovieGrid
        movies={[series]}
        onLongPressMovie={onLongPressMovie}
      />
    );
    await fireEvent(screen.getByLabelText('Series One'), 'onLongPress');
    expect(onLongPressMovie).toHaveBeenCalledWith(series);
    await fireEvent.press(screen.getByLabelText('Series One'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ posterUrl: '' }),
      })
    );
  });

  it('dismisses keyboard on scroll and omits long-press handler', async () => {
    const { Keyboard, FlatList } = require('react-native');
    const TestRenderer = require('react-test-renderer');
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    mockRouterPush();
    let renderer: { root: { findByType: (t: unknown) => { props: Record<string, any> } }; unmount: () => void };
    await act(async () => {
      renderer = TestRenderer.create(<MovieGrid movies={[movie]} />);
    });
    const list = renderer!.root.findByType(FlatList);
    list.props.onScrollBeginDrag();
    expect(dismiss).toHaveBeenCalled();
    const cardProps = list.props.renderItem({ item: movie, index: 0 }).props;
    expect(cardProps.onLongPress).toBeUndefined();
    renderer!.unmount();
    dismiss.mockRestore();
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

  it('shows empty list empty-component when header present and not loading', async () => {
    await render(
      <MovieGrid
        movies={[]}
        loading={false}
        ListHeaderComponent={<React.Fragment />}
        emptyTitle="No items"
        emptySubtitle="Sub"
      />
    );
    expect(screen.getByText('No items')).toBeTruthy();
  });

  it('uses compact empty inside a headed list', async () => {
    await render(
      <MovieGrid
        movies={[]}
        loading={false}
        emptyCompact
        ListHeaderComponent={<React.Fragment />}
        emptyTitle="Headed compact"
      />
    );
    expect(screen.getByText('Headed compact')).toBeTruthy();
  });

  it('uses compact loader inside a headed list', async () => {
    await render(
      <MovieGrid
        movies={[]}
        loading
        emptyCompact
        ListHeaderComponent={<React.Fragment />}
        emptyTitle="Headed compact"
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

  it('applies pressed style', async () => {
    mockRouterPush();
    const TestRenderer = require('react-test-renderer');
    let renderer: {
      root: {
        findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => { props: { style: (s: { pressed: boolean }) => unknown } }[];
      };
      unmount: () => void;
    };
    await act(async () => {
      renderer = TestRenderer.create(<GenresBanner />);
    });
    const pressable = renderer!.root.findAll(
      (n) => typeof n.props?.style === 'function' && typeof n.props?.onPress === 'function'
    )[0];
    expect(pressable.props.style({ pressed: true })).toBeTruthy();
    expect(pressable.props.style({ pressed: false })).toBeTruthy();
    renderer!.unmount();
  });
});
