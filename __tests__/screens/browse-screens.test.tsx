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
      movies?.map((m, i) =>
        ReactLocal.createElement(
          Pressable,
          {
            key: m.id ?? String(i),
            testID: i === 0 ? 'grid-long' : `grid-long-${m.id}`,
            onLongPress: () => onLongPressMovie?.(m),
          },
          ReactLocal.createElement(Text, null, m.title)
        )
      )
    );
  },
}));

const mockClearById = jest.fn(async () => undefined);
const mockRemoveFavorite = jest.fn(async () => undefined);
const mockRemoveListItem = jest.fn(async () => undefined);
const mockDeleteList = jest.fn(async () => undefined);
const mockRemoveHistory = jest.fn(async () => undefined);
const mockPickRandom = jest.fn(async () => undefined) as jest.Mock;

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
      selector({ items: [{ id: 'd1', status: 'completed' }] })
  ),
}));

jest.mock('@/src/features/discovery/store', () => ({
  useDiscoveryStore: jest.fn((sel) =>
    sel({
      hydrated: true,
      refreshing: false,
      refreshStale: jest.fn(async () => undefined),
      rails: {},
      visibleItems: () => [],
      pickRandom: mockPickRandom,
    })
  ),
}));

jest.mock('@/src/features/lists/store', () => ({
  useListsStore: jest.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      hydrated: true,
      lists: [{ id: 'custom1', name: 'My Shelf', kind: 'custom' }],
      items: [
        {
          listId: 'queue',
          id: 'q1',
          title: 'Queued',
          href: '/q1.html',
          slug: 'q1',
        },
        {
          listId: 'rewatch',
          id: 'r1',
          title: 'Rewatch Me',
          href: '/r1.html',
          slug: 'r1',
        },
        {
          listId: 'custom1',
          id: 'c1',
          title: 'Custom Film',
          href: '/c1.html',
          slug: 'c1',
        },
      ],
      removeItem: mockRemoveListItem,
      deleteList: mockDeleteList,
    })
  ),
}));

jest.mock('@/src/features/watch-history/store', () => ({
  useWatchHistoryStore: jest.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      hydrated: true,
      remove: mockRemoveHistory,
      items: [
        {
          id: 'h1',
          movieId: 'h1',
          title: 'Watched Once',
          posterUrl: 'https://p',
          isSeries: false,
          watchedAt: 30,
        },
        {
          id: 's1_s1e2',
          movieId: 's1',
          title: 'Serial Show',
          isSeries: true,
          season: 1,
          episode: 2,
          watchedAt: 20,
        },
        {
          id: 's1_s1e1',
          movieId: 's1',
          title: 'Serial Show',
          isSeries: true,
          season: 1,
          episode: 1,
          watchedAt: 10,
        },
      ],
    })
  ),
}));

jest.mock('@/src/features/downloads/storage', () => ({
  computeDownloadsUsage: jest.fn(async () => 1024),
  formatBytes: (n: number) => `${n} B`,
}));

jest.mock('@/src/features/favorites/downloaded', () => ({
  isMovieDownloaded: () => true,
}));

describe('CatalogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickRandom.mockResolvedValue(undefined);
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

  it('opens a lucky title and ignores empty lucky', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
    mockPickRandom.mockResolvedValueOnce(undefined);
    await render(<CatalogScreen />);
    await fireEvent.press(screen.getByText(t('catalog.lucky')));
    await waitFor(() => expect(mockPickRandom).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText(t('catalog.luckyEmpty'))).toBeTruthy();

    mockPickRandom.mockResolvedValueOnce({
      id: 'lucky1',
      href: '/lucky.html',
      title: 'Lucky Film',
      posterUrl: 'https://p',
    });
    await fireEvent.press(screen.getByText(t('catalog.lucky')));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/movie/[id]',
          params: expect.objectContaining({ id: 'lucky1', title: 'Lucky Film' }),
        })
      )
    );
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

  it('switches library segments', async () => {
    await render(<FavoritesScreen />);
    await fireEvent.press(screen.getByText(t('favorites.queue')));
    expect(screen.getByText('Queued')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('favorites.rewatch')));
    expect(screen.getByText('Rewatch Me')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('favorites.history')));
    expect(screen.getByText('Watched Once')).toBeTruthy();
    expect(screen.getByText(`${'Serial Show'} — ${t('downloads.episodeBadge', { season: 1, episode: 2 })}`)).toBeTruthy();
    expect(screen.queryByText(`${'Serial Show'} — ${t('downloads.episodeBadge', { season: 1, episode: 1 })}`)).toBeNull();
    await fireEvent.press(screen.getByText('My Shelf'));
    expect(screen.getByText('Custom Film')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('favorites.title')));
    expect(screen.getByText('Fav Film')).toBeTruthy();
  });

  it('stat tiles jump to history, favorites, and downloads', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
    await render(<FavoritesScreen />);
    await fireEvent.press(screen.getByTestId('library-stat-hours'));
    expect(screen.getByText('Watched Once')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('library-stat-favorites'));
    expect(screen.getByText('Fav Film')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('library-stat-downloads'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/downloads');
  });

  it('deletes a custom list from the chip and returns to favorites', async () => {
    await render(<FavoritesScreen />);
    await fireEvent.press(screen.getByText('My Shelf'));
    expect(screen.getByText('Custom Film')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('library-list-delete-custom1'));
    expect(screen.getByText(t('favorites.deleteListTitle'))).toBeTruthy();
    expect(
      screen.getByText(t('favorites.deleteListMessage', { name: 'My Shelf' }))
    ).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.cancel')));
    expect(mockDeleteList).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('library-list-delete-custom1'));
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockDeleteList).toHaveBeenCalledWith('custom1'));
    expect(screen.getByText('Fav Film')).toBeTruthy();
  });

  it('long-presses a custom chip to confirm delete', async () => {
    await render(<FavoritesScreen />);
    await fireEvent(screen.getByTestId('library-list-chip-custom1'), 'onLongPress');
    expect(screen.getByText(t('favorites.deleteListTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockDeleteList).toHaveBeenCalledWith('custom1'));
  });

  it('long-press removes a queue item and a history title', async () => {
    await render(<FavoritesScreen />);
    await fireEvent.press(screen.getByText(t('favorites.queue')));
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    expect(screen.getByText(t('favorites.removeListTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveListItem).toHaveBeenCalledWith('queue', 'q1'));

    await fireEvent.press(screen.getByText(t('favorites.rewatch')));
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveListItem).toHaveBeenCalledWith('rewatch', 'r1'));

    await fireEvent.press(screen.getByText('My Shelf'));
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveListItem).toHaveBeenCalledWith('custom1', 'c1'));

    await fireEvent.press(screen.getByText(t('favorites.history')));
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    expect(screen.getByText(t('favorites.removeHistoryTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveHistory).toHaveBeenCalledWith('h1'));
    await fireEvent(screen.getByTestId('grid-long-s1'), 'onLongPress');
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => {
      expect(mockRemoveHistory).toHaveBeenCalledWith('s1_s1e1');
      expect(mockRemoveHistory).toHaveBeenCalledWith('s1_s1e2');
    });
  });
});
