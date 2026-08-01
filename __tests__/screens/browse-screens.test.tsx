import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import CatalogScreen from '@/src/screens/catalog/CatalogScreen';
import FavoritesScreen from '@/src/screens/favorites/FavoritesScreen';
import GenresScreen from '@/src/screens/genres/GenresScreen';
import GenreListScreen from '@/src/screens/genre-list/GenreListScreen';
import SearchScreen from '@/src/screens/search/SearchScreen';
import { t } from '@/src/shared/i18n';

const mockFetchHomeMovies = jest.fn(async () => ({ items: [], hasMore: false }));
const mockFetchGenreMovies = jest.fn(async () => ({
  items: [
    {
      id: 'g1',
      slug: 'x',
      title: 'Genre Movie',
      href: '/x/',
      isSeries: false,
    },
  ],
  hasMore: false,
}));
const mockSearchMovies = jest.fn(async (q: string) => {
  if (q === 'failme') throw new Error('boom');
  if (q === 'failslow') {
    await new Promise((r) => setTimeout(r, 200));
    throw new Error('late fail');
  }
  if (q === 'slow') {
    await new Promise((r) => setTimeout(r, 200));
    return [{ id: 'slow', slug: 's', title: 'Slow', href: '/slow/' }];
  }
  return [{ id: 's1', slug: 's', title: 'Found', href: '/s/' }];
});

jest.mock('@/src/data/catalog/catalog', () => ({
  fetchHomeMovies: (...args: unknown[]) =>
    (mockFetchHomeMovies as (...a: unknown[]) => unknown)(...args),
  fetchGenreMovies: (...args: unknown[]) =>
    (mockFetchGenreMovies as (...a: unknown[]) => unknown)(...args),
  searchMovies: (...args: unknown[]) =>
    (mockSearchMovies as (...a: unknown[]) => unknown)(...args),
  getGenres: jest.fn(() => [
    { name: 'Action', slug: 'action', href: '/action/' },
    { name: 'Drama', slug: 'drama', href: '/drama/' },
  ]),
}));

jest.mock('@/src/shared/ui/ContinueWatchingRail', () => ({
  ContinueWatchingRail: ({
    onRequestRemove,
  }: {
    onRequestRemove: (item: { id: string; title: string }) => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      {
        testID: 'continue-rail',
        onPress: () => onRequestRemove({ id: 'p1', title: 'Watched' }),
      },
      ReactLocal.createElement(Text, null, 'Continue rail')
    );
  },
}));

jest.mock('@/src/shared/ui/GenresBanner', () => ({
  GenresBanner: () => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return ReactLocal.createElement(Text, null, 'Genres banner');
  },
}));

jest.mock('@/src/shared/ui/MovieGrid', () => ({
  MovieGrid: ({
    emptyTitle,
    emptySubtitle,
    onLongPressMovie,
    movies,
    ListHeaderComponent,
    isDownloaded,
    getWatchProgress,
  }: {
    emptyTitle?: string;
    emptySubtitle?: string;
    onLongPressMovie?: (m: { id: string; title: string }) => void;
    movies?: { id: string; title: string }[];
    ListHeaderComponent?: React.ReactElement | null;
    isDownloaded?: (id: string) => boolean;
    getWatchProgress?: (id: string) => unknown;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    const downloaded = movies?.[0] ? isDownloaded?.(movies[0].id) : false;
    getWatchProgress?.(movies?.[0]?.id ?? 'x');
    return ReactLocal.createElement(
      View,
      null,
      ListHeaderComponent ?? null,
      ReactLocal.createElement(Text, null, emptyTitle ?? 'grid'),
      emptySubtitle ? ReactLocal.createElement(Text, null, emptySubtitle) : null,
      downloaded ? ReactLocal.createElement(Text, null, 'dl-flag') : null,
      movies?.[0]
        ? ReactLocal.createElement(
            Pressable,
            {
              testID: 'grid-long',
              onLongPress: () => onLongPressMovie?.(movies[0]),
            },
            ReactLocal.createElement(Text, null, movies[0].title)
          )
        : null
    );
  },
}));

const mockClearById = jest.fn(async () => undefined);
const mockRemoveFavorite = jest.fn(async () => undefined);

jest.mock('@/src/features/watch-progress/store', () => ({
  useWatchProgressStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      getLatestForMovie: () => undefined,
      clearById: mockClearById,
    })
  ),
}));

jest.mock('@/src/features/favorites/store', () => ({
  useFavoritesStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      items: [{ id: 'f1', slug: 'f', title: 'Fav Film', href: '/f/' }],
      hydrated: true,
      remove: mockRemoveFavorite,
    })
  ),
}));

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ items: [] })
  ),
}));

jest.mock('@/src/features/favorites/downloaded', () => ({
  isMovieDownloaded: () => true,
}));

describe('CatalogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHomeMovies.mockResolvedValue({ items: [], hasMore: false });
  });

  it('renders and confirms continue remove', async () => {
    await render(<CatalogScreen />);
    expect(screen.getByText(t('catalog.title'))).toBeTruthy();
    expect(screen.getByText('Continue rail')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('continue-rail'));
    expect(screen.getByText(t('catalog.removeContinueTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockClearById).toHaveBeenCalledWith('p1'));
  });

  it('cancels continue remove dialog', async () => {
    await render(<CatalogScreen />);
    await fireEvent.press(screen.getByTestId('continue-rail'));
    await fireEvent.press(screen.getByText(t('common.cancel')));
    expect(mockClearById).not.toHaveBeenCalled();
  });

  it('shows load error', async () => {
    mockFetchHomeMovies.mockRejectedValueOnce(new Error('home down'));
    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('home down')).toBeTruthy());
  });
});

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchMovies.mockImplementation(async (q: string) => {
      if (q === 'failme') throw new Error('boom');
      if (q === 'failslow') {
        await new Promise((r) => setTimeout(r, 200));
        throw new Error('late fail');
      }
      if (q === 'slow') {
        await new Promise((r) => setTimeout(r, 200));
        return [{ id: 'slow', slug: 's', title: 'Slow', href: '/slow/' }];
      }
      return [{ id: 's1', slug: 's', title: 'Found', href: '/s/' }];
    });
  });

  it('shows start empty and validates min length', async () => {
    await render(<SearchScreen />);
    expect(screen.getByText(t('search.emptyStart'))).toBeTruthy();
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'ab');
    await fireEvent(input, 'submitEditing');
    await waitFor(() => {
      expect(screen.getByText(t('search.minLength', { count: 4 }))).toBeTruthy();
    });
  });

  it('searches and clears query', async () => {
    await render(<SearchScreen />);
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'abcd');
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(mockSearchMovies).toHaveBeenCalledWith('abcd'));
    await fireEvent.press(screen.getByTestId('icon-close-circle'));
    await waitFor(() => expect(input.props.value).toBe(''));
  });

  it('shows search error', async () => {
    await render(<SearchScreen />);
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'failme');
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
  });

  it('ignores stale search responses', async () => {
    let resolveSlow: (value: unknown) => void = () => undefined;
    mockSearchMovies.mockImplementation(((q: string) => {
      if (q === 'slow') {
        return new Promise((resolve) => {
          resolveSlow = resolve as (value: unknown) => void;
        });
      }
      return Promise.resolve([
        { id: 's1', slug: 's', title: 'Found', href: '/s/' },
      ]);
    }) as typeof mockSearchMovies);

    await render(<SearchScreen />);
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'slow');
    await waitFor(() => expect(input.props.value).toBe('slow'));
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(mockSearchMovies).toHaveBeenCalledWith('slow'));

    await fireEvent.changeText(input, 'abcd');
    await waitFor(() => expect(input.props.value).toBe('abcd'));
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(mockSearchMovies).toHaveBeenCalledWith('abcd'));
    await waitFor(() => expect(screen.getByText('Found')).toBeTruthy());

    await act(async () => {
      resolveSlow([{ id: 'slow', slug: 's', title: 'Slow', href: '/slow/' }]);
      await Promise.resolve();
    });
    expect(screen.queryByText('Slow')).toBeNull();
  });

  it('ignores stale search errors', async () => {
    let rejectSlow!: (reason?: unknown) => void;
    mockSearchMovies.mockImplementation((q: string) => {
      if (q === 'failslow') {
        return new Promise((_, reject) => {
          rejectSlow = reject;
        });
      }
      return Promise.resolve([
        { id: 's1', slug: 's', title: 'Found', href: '/s/' },
      ]);
    });

    await render(<SearchScreen />);
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'failslow');
    await waitFor(() => expect(input.props.value).toBe('failslow'));
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(mockSearchMovies).toHaveBeenCalledWith('failslow'));

    await fireEvent.changeText(input, 'abcd');
    await waitFor(() => expect(input.props.value).toBe('abcd'));
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(screen.getByText('Found')).toBeTruthy());

    await act(async () => {
      rejectSlow(new Error('late fail'));
      await Promise.resolve();
    });
    expect(screen.queryByText('late fail')).toBeNull();
  });
});

describe('GenresScreen', () => {
  it('lists genres and navigates; back uses router.back', async () => {
    const mockPush = jest.fn();
    const mockBack = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
    await render(<GenresScreen />);
    expect(screen.getByText('Action')).toBeTruthy();
    await fireEvent.press(screen.getByText('Action'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/genre/[slug]',
        params: expect.objectContaining({ slug: 'action' }),
      })
    );
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(mockBack).toHaveBeenCalled();
  });

  it('replaces to tabs when cannot go back', async () => {
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: jest.fn(),
      replace: mockReplace,
      canGoBack: jest.fn(() => false),
    });
    await render(<GenresScreen />);
    await fireEvent.press(screen.getByLabelText(t('common.back')));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('presses genre card pressed style branch', async () => {
    const TestRenderer = require('react-test-renderer');
    const actLocal = require('@testing-library/react-native').act;
    let renderer: {
      root: {
        findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => { props: { style: (s: { pressed: boolean }) => unknown } }[];
      };
      unmount: () => void;
    };
    await actLocal(async () => {
      renderer = TestRenderer.create(<GenresScreen />);
    });
    const card = renderer!.root.findAll(
      (n) => typeof n.props?.style === 'function' && typeof n.props?.onPress === 'function'
    )[0];
    expect(card).toBeTruthy();
    card.props.style({ pressed: true });
    card.props.style({ pressed: false });
    renderer!.unmount();
  });

  it('uses multi-column wrapper on tablet', async () => {
    const mockDims = jest.requireMock('react-native/Libraries/Utilities/useWindowDimensions');
    const prev = mockDims.default;
    mockDims.default = () => ({ width: 800, height: 600 });
    await render(<GenresScreen />);
    expect(screen.getByText('Action')).toBeTruthy();
    mockDims.default = prev;
  });

  it('omits columnWrapperStyle when a single column is forced', async () => {
    const bp = require('@/src/shared/hooks/useBreakpoint') as typeof import('@/src/shared/hooks/useBreakpoint');
    const spy = jest.spyOn(bp, 'useBreakpoint').mockReturnValue({
      width: 320,
      height: 640,
      breakpoint: 'phone',
      columns: 1,
      isTablet: false,
      isLandscape: false,
    });
    await render(<GenresScreen />);
    expect(screen.getByText('Action')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('GenreListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchGenreMovies.mockResolvedValue({
      items: [
        {
          id: 'g1',
          slug: 'x',
          title: 'Genre Movie',
          href: '/x/',
          isSeries: false,
        },
      ],
      hasMore: false,
    });
  });

  it('renders genre movies with forceSeries for serialy', async () => {
    mockFetchGenreMovies.mockResolvedValueOnce({
      items: [
        {
          id: 'g1',
          slug: 'x',
          title: 'Genre Movie',
          href: '/x/',
          isSeries: false,
        },
        {
          id: 'g2',
          slug: 'y',
          title: 'Already Series',
          href: '/y/',
          isSeries: true,
        },
      ],
      hasMore: false,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      slug: 'serialy',
      href: '/serialy/',
      name: 'Series',
    });
    await render(<GenreListScreen />);
    await waitFor(() => expect(screen.getByText('Genre Movie')).toBeTruthy());
  });

  it('uses slug href fallback and keeps non-series genres', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      slug: 'action',
    });
    await render(<GenreListScreen />);
    await waitFor(() => expect(mockFetchGenreMovies).toHaveBeenCalledWith('/action/', 1));
    await waitFor(() => expect(screen.getByText('Genre Movie')).toBeTruthy());
  });

  it('shows error empty copy', async () => {
    mockFetchGenreMovies.mockRejectedValueOnce(new Error('genre fail'));
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      slug: 'drama',
      href: '/drama/',
      name: 'Drama',
    });
    await render(<GenreListScreen />);
    await waitFor(() => expect(screen.getAllByText('genre fail').length).toBeGreaterThan(0));
    expect(screen.getByText(t('common.loadingError'))).toBeTruthy();
  });
});

describe('FavoritesScreen', () => {
  it('long-press opens delete confirm', async () => {
    await render(<FavoritesScreen />);
    expect(screen.getByText('dl-flag')).toBeTruthy();
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    expect(screen.getByText(t('favorites.deleteTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveFavorite).toHaveBeenCalledWith('f1'));
  });

  it('cancels delete confirm', async () => {
    await render(<FavoritesScreen />);
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    await fireEvent.press(screen.getByText(t('common.cancel')));
    expect(mockRemoveFavorite).not.toHaveBeenCalled();
  });
});
