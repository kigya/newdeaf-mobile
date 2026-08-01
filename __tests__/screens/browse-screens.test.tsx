import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import CatalogScreen from '@/src/screens/catalog/CatalogScreen';
import FavoritesScreen from '@/src/screens/favorites/FavoritesScreen';
import GenresScreen from '@/src/screens/genres/GenresScreen';
import GenreListScreen from '@/src/screens/genre-list/GenreListScreen';
import SearchScreen from '@/src/screens/search/SearchScreen';
import { t } from '@/src/shared/i18n';

jest.mock('@/src/data/catalog/catalog', () => ({
  fetchHomeMovies: jest.fn(async () => ({ items: [], hasMore: false })),
  fetchGenreMovies: jest.fn(async () => ({
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
  })),
  searchMovies: jest.fn(async (q: string) => {
    if (q === 'failme') throw new Error('boom');
    return [{ id: 's1', slug: 's', title: 'Found', href: '/s/' }];
  }),
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
  }: {
    emptyTitle?: string;
    emptySubtitle?: string;
    onLongPressMovie?: (m: { id: string; title: string }) => void;
    movies?: { id: string; title: string }[];
    ListHeaderComponent?: React.ReactElement | null;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      null,
      ListHeaderComponent ?? null,
      ReactLocal.createElement(Text, null, emptyTitle ?? 'grid'),
      emptySubtitle ? ReactLocal.createElement(Text, null, emptySubtitle) : null,
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
  isMovieDownloaded: () => false,
}));

describe('CatalogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});

describe('SearchScreen', () => {
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
    const { searchMovies } = require('@/src/data/catalog/catalog');
    await render(<SearchScreen />);
    const input = screen.getByPlaceholderText(t('search.placeholder'));
    await fireEvent.changeText(input, 'abcd');
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(searchMovies).toHaveBeenCalledWith('abcd'));
    await fireEvent.press(screen.getByTestId('icon-close-circle'));
    await waitFor(() => expect(input.props.value).toBe(''));
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
});

describe('GenreListScreen', () => {
  it('renders genre movies with forceSeries for serialy', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      slug: 'serialy',
      href: '/serialy/',
      name: 'Series',
    });
    await render(<GenreListScreen />);
    await waitFor(() => expect(screen.getByText('Genre Movie')).toBeTruthy());
  });
});

describe('FavoritesScreen', () => {
  it('long-press opens delete confirm', async () => {
    await render(<FavoritesScreen />);
    await fireEvent(screen.getByTestId('grid-long'), 'onLongPress');
    expect(screen.getByText(t('favorites.deleteTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.delete')));
    await waitFor(() => expect(mockRemoveFavorite).toHaveBeenCalledWith('f1'));
  });
});
