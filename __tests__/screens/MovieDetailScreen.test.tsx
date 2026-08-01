import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import MovieDetailScreen from '@/src/screens/movie-detail/MovieDetailScreen';
import { t, setLocale } from '@/src/shared/i18n';
import type { MovieDetail, PlayerFileList, StreamPayload } from '@/src/data/catalog/types';

const mockPush = jest.fn();
const mockFetchMovieDetail = jest.fn();
const mockFetchPlayerFileList = jest.fn();
const mockEnrichMovieMetadata = jest.fn();
const mockEnrichFromKinopoisk = jest.fn();
const mockToggleFavorite = jest.fn(async () => undefined);
const mockClearProgress = jest.fn(async () => undefined);
const mockFetchProgress = jest.fn();
const mockFetchLatestProgressForMovie = jest.fn();
const mockListSeasons = jest.fn((fl: PlayerFileList) =>
  Object.keys(fl.all)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
);
const mockListEpisodes = jest.fn((fl: PlayerFileList, season: number) =>
  Object.keys(fl.all[String(season)] ?? {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
);
const mockBuildPlayerUrl = jest.fn(
  (base: string, opts: Record<string, unknown>) =>
    `${base}?s=${opts.season ?? ''}&e=${opts.episode ?? ''}&t=${opts.time ?? ''}&tr=${opts.translation ?? ''}`
);
const mockPickEpisodeEntry = jest.fn(() => ({
  id: 1,
  translation: 'Subs',
  id_translation: 79,
  quality: '720',
  id_quality: 1,
}));
const mockOpenBrowserAsync = jest.fn(async () => ({ type: 'dismiss' }));
const mockListCompletedDownloads = jest.fn(() => [] as unknown[]);

let mockFavoriteItems: { id: string }[] = [];
let mockDownloadItems: unknown[] = [];
let mockBreakpoint = { isTablet: false, width: 390, columns: 2 };

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => (mockOpenBrowserAsync as any)(...args),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, { testID: 'linear-gradient', ...props }, children),
  };
});

jest.mock('react-native-webview', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) =>
      ReactLocal.createElement(View, { testID: 'trailer-webview', ...props }),
  };
});

jest.mock('@/src/shared/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockBreakpoint,
}));

jest.mock('@/src/data/catalog/catalog', () => ({
  fetchMovieDetail: (...args: unknown[]) => mockFetchMovieDetail(...args),
  fetchPlayerFileList: (...args: unknown[]) => mockFetchPlayerFileList(...args),
}));

jest.mock('@/src/data/catalog/parse', () => ({
  buildPlayerUrl: (...args: unknown[]) =>
    mockBuildPlayerUrl(...(args as [string, Record<string, unknown>])),
  listSeasons: (...args: unknown[]) => mockListSeasons(...(args as [PlayerFileList])),
  listEpisodes: (...args: unknown[]) =>
    mockListEpisodes(...(args as [PlayerFileList, number])),
  pickEpisodeEntry: (...args: unknown[]) => (mockPickEpisodeEntry as any)(...args),
}));

jest.mock('@/src/data/catalog/tmdb', () => ({
  enrichMovieMetadata: (...args: unknown[]) => mockEnrichMovieMetadata(...args),
}));

jest.mock('@/src/data/catalog/kinopoisk', () => ({
  enrichFromKinopoisk: (...args: unknown[]) => mockEnrichFromKinopoisk(...args),
}));

jest.mock('@/src/features/favorites/store', () => ({
  useFavoritesStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      items: mockFavoriteItems,
      toggle: mockToggleFavorite,
    })
  ),
}));

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ items: mockDownloadItems })
  ),
}));

jest.mock('@/src/features/downloads/match', () => ({
  listCompletedDownloads: (...args: unknown[]) =>
    (mockListCompletedDownloads as any)(...args),
}));

jest.mock('@/src/features/watch-progress/store', () => ({
  useWatchProgressStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ clear: mockClearProgress })
  ),
  fetchProgress: (...args: unknown[]) => mockFetchProgress(...args),
  fetchLatestProgressForMovie: (...args: unknown[]) =>
    mockFetchLatestProgressForMovie(...args),
}));

jest.mock('@/src/features/watch-progress/format', () => ({
  resumeDialogMessage: () => 'Resume at 1:00',
}));

jest.mock('@/src/shared/ui/DownloadSheet', () => {
  const ReactLocal = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    DownloadSheet: ({
      visible,
      onClose,
      title,
    }: {
      visible: boolean;
      onClose: () => void;
      title?: string;
    }) =>
      visible
        ? ReactLocal.createElement(
            Pressable,
            { testID: 'download-sheet', onPress: onClose },
            ReactLocal.createElement(Text, null, `sheet:${title}`)
          )
        : null,
  };
});

jest.mock('@/src/shared/ui/ConfirmDialog', () => {
  const ReactLocal = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ConfirmDialog: ({
      visible,
      onConfirm,
      onCancel,
      title,
    }: {
      visible: boolean;
      onConfirm: () => void;
      onCancel: () => void;
      title?: string;
    }) =>
      visible
        ? ReactLocal.createElement(
            View,
            { testID: 'confirm-dialog' },
            ReactLocal.createElement(Text, null, title),
            ReactLocal.createElement(
              Pressable,
              { testID: 'confirm-yes', onPress: onConfirm },
              ReactLocal.createElement(Text, null, 'yes')
            ),
            ReactLocal.createElement(
              Pressable,
              { testID: 'confirm-no', onPress: onCancel },
              ReactLocal.createElement(Text, null, 'no')
            )
          )
        : null,
  };
});

jest.mock('@/src/features/playback/StreamResolver', () => {
  const ReactLocal = require('react');
  const { Text, View } = require('react-native');
  return {
    StreamResolver: ({
      onResolved,
      onError,
      playerUrl,
    }: {
      onResolved: (p: StreamPayload) => void;
      onError: (m: string) => void;
      playerUrl: string;
    }) => {
      const fired = ReactLocal.useRef('');
      if (fired.current !== playerUrl) {
        fired.current = playerUrl;
        // Defer so we don't setState during parent render
        Promise.resolve().then(() => {
          if (String(playerUrl).includes('fail-stream')) {
            onError('stream failed');
          } else {
            onResolved({
              hlsSource: [{ label: 'Original', quality: { '720': 'https://x/720.m3u8' } }],
              tracks: [{ kind: 'captions', label: 'EN', src: 'https://x/en.vtt' }],
            });
          }
        });
      }
      return ReactLocal.createElement(
        View,
        { testID: 'stream-resolver' },
        ReactLocal.createElement(Text, null, playerUrl)
      );
    },
  };
});

const baseMovie = (overrides: Partial<MovieDetail> = {}): MovieDetail => ({
  id: '42',
  slug: 'test-movie',
  title: 'Test Movie',
  href: '/42-test-movie.html',
  genres: ['Action'],
  genreHrefs: [{ name: 'Action', href: '/action/' }],
  actors: ['Actor A', 'Actor B'],
  year: '2020',
  country: 'USA',
  duration: '120 min',
  director: 'Jane Doe',
  description: 'A plot',
  kpRating: '8.0',
  imdbRating: '7.5',
  posterUrl: 'https://cdn.example/p.jpg',
  playerUrl: 'https://stloadi.live/embed?token=abc',
  nativePlayer: true,
  translationId: '79',
  ...overrides,
});

const serialFileList: PlayerFileList = {
  type: 'serial',
  active: { id: 1, translation: 'Subs', id_translation: 79, quality: '720', id_quality: 1, seasons: 1, episode: 1 },
  all: {
    '1': {
      '1': {
        '79': {
          id: 1,
          translation: 'Subs',
          id_translation: 79,
          quality: '720',
          id_quality: 1,
        },
      },
      '2': {
        '79': {
          id: 2,
          translation: 'Subs',
          id_translation: 79,
          quality: '720',
          id_quality: 1,
        },
      },
    },
    '2': {
      '1': {
        '79': {
          id: 3,
          translation: 'Subs',
          id_translation: 79,
          quality: '720',
          id_quality: 1,
        },
      },
    },
  },
};

function mockParams(params: Record<string, string> = { id: '42', href: '/42-test-movie.html' }) {
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  });
  (Stack.Screen as unknown as jest.Mock).mockImplementation(
    ({ options }: { options?: { headerRight?: () => React.ReactNode; title?: string } }) => {
      const ReactLocal = require('react');
      const { View, Text } = require('react-native');
      return ReactLocal.createElement(
        View,
        { testID: 'stack-screen' },
        ReactLocal.createElement(Text, null, options?.title ?? ''),
        options?.headerRight?.() ?? null
      );
    }
  );
}

describe('MovieDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFavoriteItems = [];
    mockDownloadItems = [];
    mockBreakpoint = { isTablet: false, width: 390, columns: 2 };
    setLocale('en');
    mockParams();
    mockFetchLatestProgressForMovie.mockResolvedValue(null);
    mockFetchProgress.mockResolvedValue(null);
    mockEnrichMovieMetadata.mockResolvedValue(null);
    mockEnrichFromKinopoisk.mockImplementation(
      async (
        _q: unknown,
        onPartial?: (p: unknown) => void
      ) => {
        onPartial?.({
          awards: [{ name: 'Oscar' }],
          staff: [
            { staffId: 1, nameRu: 'Иван', nameEn: 'Ivan', posterUrl: 'https://cdn/a.jpg', description: 'Role' },
            { staffId: 2, nameEn: 'OnlyEn' },
            { staffId: 3, nameRu: '', nameEn: '' },
          ],
          facts: [
            { text: 'Fun fact', spoiler: false },
            { text: 'Spoiler fact', spoiler: true },
          ],
          similar: [
            { id: 's1', title: 'Similar One', href: '/s1/', posterUrl: 'https://cdn/s.jpg' },
            { id: 's2', title: 'Similar Two', href: '/s2/' },
          ],
          related: [
            { id: 'r1', title: 'Related One', href: '/r1/', posterUrl: 'https://cdn/r.jpg' },
            { id: 'r2', title: 'Related Two', href: '/r2/' },
          ],
        });
        return {
          awards: [{ name: 'Oscar' }],
          staff: [
            { staffId: 1, nameRu: 'Иван', nameEn: 'Ivan', posterUrl: 'https://cdn/a.jpg', description: 'Role' },
            { staffId: 2, nameEn: 'OnlyEn' },
            { staffId: 3, nameRu: '', nameEn: '' },
          ],
          facts: [
            { text: 'Fun fact', spoiler: false },
            { text: 'Spoiler fact', spoiler: true },
          ],
          similar: [
            { id: 's1', title: 'Similar One', href: '/s1/', posterUrl: 'https://cdn/s.jpg' },
            { id: 's2', title: 'Similar Two', href: '/s2/' },
          ],
          related: [
            { id: 'r1', title: 'Related One', href: '/r1/', posterUrl: 'https://cdn/r.jpg' },
            { id: 'r2', title: 'Related Two', href: '/r2/' },
          ],
        };
      }
    );
    mockFetchPlayerFileList.mockResolvedValue(null);
    mockListCompletedDownloads.mockReturnValue([]);
    mockListEpisodes.mockImplementation((fl: PlayerFileList, season: number) =>
      Object.keys(fl.all[String(season)] ?? {})
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
    );
    mockListSeasons.mockImplementation((fl: PlayerFileList) =>
      Object.keys(fl.all)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
    );
    mockPickEpisodeEntry.mockImplementation(() => ({
      id: 1,
      translation: 'Subs',
      id_translation: 79,
      quality: '720',
      id_quality: 1,
    }));
    mockToggleFavorite.mockImplementation(async () => undefined);
  });

  it('shows loading then success movie', async () => {
    let resolveDetail!: (v: MovieDetail) => void;
    mockFetchMovieDetail.mockReturnValue(
      new Promise<MovieDetail>((resolve) => {
        resolveDetail = resolve;
      })
    );
    await render(<MovieDetailScreen />);
    expect(screen.getByTestId('stack-screen')).toBeTruthy();

    await act(async () => {
      resolveDetail(baseMovie());
    });
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
    expect(screen.getByText(t('common.watch'))).toBeTruthy();
    expect(screen.getByText(t('common.download'))).toBeTruthy();
  });

  it('shows error state when fetch fails', async () => {
    mockFetchMovieDetail.mockRejectedValue(new Error('network down'));
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('network down')).toBeTruthy());
  });

  it('shows notFound when movie missing after load without error', async () => {
    // Force error path with empty message via non-Error throw handled by errorMessage
    mockFetchMovieDetail.mockRejectedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText(t('common.loadingError'))).toBeTruthy()
    );
  });

  it('toggles favorite from header', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByLabelText(t('movie.addFavorite')));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalled());
    expect((mockToggleFavorite.mock.calls[0] as any)[0].id).toBe('42');
  });

  it('shows remove favorite label when already favorited', async () => {
    mockFavoriteItems = [{ id: '42' }];
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText(t('movie.removeFavorite'))).toBeTruthy()
    );
  });

  it('plays without resume prompt when no progress', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    mockFetchProgress.mockResolvedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('common.watch'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockClearProgress).toHaveBeenCalled();
    expect(mockPush.mock.calls[0][0].pathname).toBe('/player/[id]');
  });

  it('shows resume dialog and continues / starts over', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    mockFetchProgress.mockResolvedValue({
      id: '42',
      movieId: '42',
      positionSec: 120,
      durationSec: 600,
      title: 'Test Movie',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('common.watch'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockBuildPlayerUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ time: 120 })
    );

    mockPush.mockClear();
    mockClearProgress.mockClear();
    mockFetchProgress.mockResolvedValue({
      id: '42',
      movieId: '42',
      positionSec: 90,
      durationSec: 600,
      title: 'Test Movie',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    });
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(screen.getByTestId('confirm-no')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('confirm-no'));
    await waitFor(() => expect(mockClearProgress).toHaveBeenCalled());
  });

  it('opens download sheet', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('common.download'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() => expect(screen.getByTestId('download-sheet')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('download-sheet'));
    await waitFor(() => expect(screen.queryByTestId('download-sheet')).toBeNull());
  });

  it('loads serial file list, selects season/episode, restores latest progress', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, season: 1, episode: 1, title: 'Serial Show' })
    );
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    mockFetchLatestProgressForMovie.mockResolvedValue({
      id: '42_s2e1',
      movieId: '42',
      season: 2,
      episode: 1,
      positionSec: 50,
      durationSec: 600,
      title: 'Serial Show',
      isSeries: true,
      source: 'online',
      updatedAt: 1,
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
    expect(screen.getByText(t('movie.season', { n: 1 }))).toBeTruthy();
    expect(screen.getByText(t('movie.season', { n: 2 }))).toBeTruthy();

    await fireEvent.press(screen.getByText(t('movie.season', { n: 1 })));
    await fireEvent.press(screen.getByText(t('movie.episode', { n: 2 })));
    expect(mockListEpisodes).toHaveBeenCalled();
  });

  it('uses fileList active season when no matching progress', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ isSeries: true }));
    mockFetchPlayerFileList.mockResolvedValue({
      ...serialFileList,
      active: {
        id: 1,
        translation: 'Subs',
        id_translation: 79,
        quality: '720',
        id_quality: 1,
        seasons: 2,
        episode: 1,
      },
    });
    mockFetchLatestProgressForMovie.mockResolvedValue({
      season: 9,
      episode: 9,
      positionSec: 50,
      durationSec: 600,
      movieId: '42',
      id: 'x',
      title: 'x',
      isSeries: true,
      source: 'online',
      updatedAt: 1,
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
  });

  it('enriches from TMDB when locale is en', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ description: 'RU plot' }));
    mockEnrichMovieMetadata.mockResolvedValue({
      title: 'EN Title',
      overview: 'EN plot',
      actors: ['Tom'],
      director: 'EN Dir',
      originalTitle: 'Original',
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('EN Title').length).toBeGreaterThan(0));
    expect(screen.getByText('EN plot')).toBeTruthy();
    expect(screen.getByText(t('movie.director', { name: 'EN Dir' }))).toBeTruthy();
  });

  it('keeps scraped metadata when TMDB enrichment throws', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    mockEnrichMovieMetadata.mockRejectedValue(new Error('tmdb down'));
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
  });

  it('skips TMDB when locale is ru', async () => {
    setLocale('ru');
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
    expect(mockEnrichMovieMetadata).not.toHaveBeenCalled();
  });

  it('handles non-native player (tracks unavailable, download disabled)', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({
        nativePlayer: false,
        playerUrl: 'https://kodik.info/embed/1',
      })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText(t('movie.tracksUnavailable'))).toBeTruthy()
    );
    expect(screen.getByText(t('movie.downloadUnavailable'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.download')));
    expect(screen.queryByTestId('download-sheet')).toBeNull();
  });

  it('shows noPlayer when playerUrl missing', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ playerUrl: undefined, nativePlayer: undefined })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.noPlayer'))).toBeTruthy());
    expect(screen.getByText(t('common.watch'))).toBeTruthy();
  });

  it('opens youtube trailer and renders stream tracks', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ trailerYoutubeId: 'abc123XYZ' })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.watchTrailer'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('movie.watchTrailer')));
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123XYZ'
    );

    await waitFor(() => expect(screen.getByText('Original')).toBeTruthy());
    expect(screen.getByText('EN')).toBeTruthy();
  });

  it('renders trailer webview embed when no youtube id', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({
        trailerYoutubeId: undefined,
        trailerUrl: 'https://example.com/trailer',
      })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('trailer-webview')).toBeTruthy());
  });

  it('handles stream resolve error', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ playerUrl: 'https://stloadi.live/embed?token=fail-stream' })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('stream failed')).toBeTruthy());
  });

  it('shows poster fallback, actors fallback, and offline copies', async () => {
    mockListCompletedDownloads.mockReturnValue([
      {
        id: 'dl1',
        movieId: '42',
        audioLabel: 'Original',
        subtitleLabel: 'EN',
        quality: '720',
        status: 'completed',
      },
    ]);
    mockEnrichFromKinopoisk.mockResolvedValue(null);
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({
        posterUrl: undefined,
        kpRating: undefined,
        imdbRating: undefined,
        year: undefined,
        country: undefined,
        duration: undefined,
        director: undefined,
        genres: [],
        description: undefined,
        actors: ['Solo Actor'],
      })
    );
    mockParams({ id: '42', title: 'Param Title', posterUrl: '' });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
    expect(screen.getByText('T')).toBeTruthy(); // poster letter
    expect(screen.getByText('Solo Actor')).toBeTruthy();
    expect(screen.getByText(t('movie.downloadedSection'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('movie.watchOffline')));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/offline/[downloadId]' })
    );
  });

  it('uses list poster param when detail has no poster', async () => {
    mockEnrichFromKinopoisk.mockResolvedValue({ awards: [], staff: [], facts: [], similar: [], related: [] });
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ posterUrl: undefined }));
    mockParams({
      id: '42',
      href: '/42-test-movie.html',
      posterUrl: 'https://cdn.example/list.jpg',
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
  });

  it('navigates to similar and related titles', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('Similar One')).toBeTruthy());
    await fireEvent.press(screen.getByText('Similar One'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/movie/[id]' })
    );
    await fireEvent.press(screen.getByText('Related Two'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ id: 'r2' }),
      })
    );
  });

  it('uses tablet poster sizing', async () => {
    mockBreakpoint = { isTablet: true, width: 900, columns: 4 };
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0));
  });

  it('cancels in-flight load on unmount', async () => {
    let resolveDetail!: (v: MovieDetail) => void;
    mockFetchMovieDetail.mockReturnValue(
      new Promise<MovieDetail>((resolve) => {
        resolveDetail = resolve;
      })
    );
    const { unmount } = await render(<MovieDetailScreen />);
    await unmount();
    await act(async () => {
      resolveDetail(baseMovie());
    });
  });

  it('handles kinopoisk enrichment failure after partial', async () => {
    mockEnrichFromKinopoisk.mockImplementation(
      async (_q: unknown, onPartial?: (p: unknown) => void) => {
        onPartial?.({
          awards: [{ name: 'Partial' }],
          staff: [],
          facts: [],
          similar: [],
          related: [],
        });
        return Promise.reject(new Error('kp fail'));
      }
    );
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('Partial')).toBeTruthy());
  });

  it('falls back to fileList defaults when active missing on serial', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, season: undefined, episode: undefined })
    );
    mockFetchPlayerFileList.mockResolvedValue({
      type: 'serial',
      all: serialFileList.all,
    });
    mockFetchLatestProgressForMovie.mockResolvedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
  });

  it('does not toggle favorite without id', async () => {
    mockParams({ id: '', href: '/42-test-movie.html', title: 'Param Title' });
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0)
    );
    const btn = screen.getByLabelText(t('movie.addFavorite'));
    await fireEvent.press(btn);
    expect(mockToggleFavorite).not.toHaveBeenCalled();
  });

  it('keeps scraped fields when TMDB returns empty overlays', async () => {
    mockEnrichMovieMetadata.mockResolvedValue({
      title: '',
      overview: '',
      actors: [],
      director: '',
      originalTitle: '',
    });
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0)
    );
    expect(screen.getByText('A plot')).toBeTruthy();
  });

  it('shows notFound when error message is empty', async () => {
    mockFetchMovieDetail.mockRejectedValue(new Error(''));
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.notFound'))).toBeTruthy());
  });

  it('shows kp loading extras then ignores callbacks after unmount', async () => {
    let finishKp!: (partial: unknown) => void;
    mockEnrichFromKinopoisk.mockImplementation(
      (_q: unknown, onPartial?: (p: unknown) => void) =>
        new Promise((resolve) => {
          finishKp = (partial) => {
            onPartial?.(partial);
            resolve(partial);
          };
        })
    );
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    const { unmount } = await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.loadingExtras'))).toBeTruthy());
    await unmount();
    await act(async () => {
      finishKp({
        awards: [{ name: 'Late' }],
        staff: [],
        facts: [],
        similar: [],
        related: [],
      });
    });
  });

  it('cancels serial fileList handling after unmount mid-fetch', async () => {
    let resolveFl!: (v: PlayerFileList | null) => void;
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, playerUrl: 'https://stloadi.live/p' })
    );
    mockFetchPlayerFileList.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFl = resolve;
        })
    );
    const { unmount } = await render(<MovieDetailScreen />);
    await waitFor(() => expect(mockFetchPlayerFileList).toHaveBeenCalled());
    await unmount();
    await act(async () => {
      resolveFl(serialFileList);
    });
  });

  it('plays serial episode and opens episode download sheet', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, translationId: '79', title: 'Serial Show' })
    );
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    mockFetchProgress.mockResolvedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockClearProgress).toHaveBeenCalledWith('42', expect.any(Number), expect.any(Number));
    expect(mockPush.mock.calls[0][0].params.isSeries).toBe('1');

    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() => expect(screen.getByTestId('download-sheet')).toBeTruthy());
  });

  it('blocks double favorite toggle while busy and handles press style', async () => {
    let release!: () => void;
    mockToggleFavorite.mockImplementation(
      (() =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        })) as any
    );
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0)
    );
    const btn = screen.getByLabelText(t('movie.addFavorite'));
    await fireEvent(btn, 'pressIn');
    await fireEvent.press(btn);
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalledTimes(1));
    await fireEvent.press(btn);
    expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
  });

  it('favorite while loading uses param fallbacks when movie is null', async () => {
    mockParams({
      id: '77',
      title: 'From Params',
      posterUrl: 'https://cdn.example/p.jpg',
      href: '/77-x.html',
    });
    mockFetchMovieDetail.mockReturnValue(new Promise(() => {}));
    await render(<MovieDetailScreen />);
    await fireEvent.press(screen.getByLabelText(t('movie.addFavorite')));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalled());
    expect((mockToggleFavorite.mock.calls[0] as any)[0]).toMatchObject({
      id: '77',
      slug: '77',
      title: 'From Params',
      posterUrl: 'https://cdn.example/p.jpg',
      href: '/77-x.html',
    });
  });

  it('favorite without param title uses common.movie fallback', async () => {
    mockParams({ id: '88' });
    mockFetchMovieDetail.mockReturnValue(new Promise(() => {}));
    await render(<MovieDetailScreen />);
    await fireEvent.press(screen.getByLabelText(t('movie.addFavorite')));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalled());
    expect((mockToggleFavorite.mock.calls[0] as any)[0].title).toBe(t('common.movie'));
    expect((mockToggleFavorite.mock.calls[0] as any)[0].href).toBe('/88.html');
  });

  it('cancels after TMDB starts so post-enrich cancelled return runs', async () => {
    let resolveTmdb!: (v: unknown) => void;
    mockEnrichMovieMetadata.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTmdb = resolve;
        })
    );
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    const { unmount } = await render(<MovieDetailScreen />);
    await waitFor(() => expect(mockEnrichMovieMetadata).toHaveBeenCalled());
    await unmount();
    await act(async () => {
      resolveTmdb(null);
    });
  });

  it('serial without seasons in fileList uses defaults', async () => {
    mockListSeasons.mockReturnValue([]);
    mockListEpisodes.mockReturnValue([]);
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ isSeries: true }));
    mockFetchPlayerFileList.mockResolvedValue({ type: 'serial', all: {} });
    mockFetchLatestProgressForMovie.mockResolvedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
  });

  it('pickEpisodeEntry null falls back to movie translationId', async () => {
    mockPickEpisodeEntry.mockReturnValue(null as any);
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, translationId: '55' })
    );
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
    expect(mockBuildPlayerUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ translation: '55' })
    );
  });

  it('hides cast when no kp staff and no actors', async () => {
    mockEnrichFromKinopoisk.mockResolvedValue({
      awards: [],
      staff: [],
      facts: [],
      similar: [],
      related: [],
    });
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ actors: [] }));
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(t('movie.cast'))).toBeNull();
  });

  it('loads movie-type fileList without season UI', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    mockFetchPlayerFileList.mockResolvedValue({
      type: 'movie',
      all: {
        '1': {
          '1': {
            '1': {
              id: 1,
              translation: 'A',
              id_translation: 1,
              quality: '720',
              id_quality: 1,
            },
          },
        },
      },
    });
    await render(<MovieDetailScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('Test Movie').length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(t('movie.serial'))).toBeNull();
  });

  it('builds serial player url without translationId', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ isSeries: true, translationId: undefined })
    );
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.serial'))).toBeTruthy());
    expect(mockPickEpisodeEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      undefined
    );
  });

  it('ignores fetch error after unmount', async () => {
    let rejectDetail!: (e: Error) => void;
    mockFetchMovieDetail.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDetail = reject;
      })
    );
    const { unmount } = await render(<MovieDetailScreen />);
    await unmount();
    await act(async () => {
      rejectDetail(new Error('late fail'));
    });
  });

  it('ignores non-native tracks error after unmount during tmdb', async () => {
    let resolveTmdb!: (v: unknown) => void;
    mockEnrichMovieMetadata.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTmdb = resolve;
        })
    );
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ nativePlayer: false, playerUrl: 'https://kodik.info/e' })
    );
    const { unmount } = await render(<MovieDetailScreen />);
    await waitFor(() => expect(mockEnrichMovieMetadata).toHaveBeenCalled());
    await unmount();
    await act(async () => {
      resolveTmdb(null);
    });
  });

  it('uses param fallbacks in favorite summary when movie fields sparse', async () => {
    mockParams({
      id: '99',
      title: 'Param Title',
      posterUrl: 'https://cdn.example/param.jpg',
      href: '/99-x.html',
    });
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({
        id: '99',
        slug: '',
        title: 'X',
        posterUrl: undefined,
        href: undefined,
        year: undefined,
        kpRating: undefined,
        imdbRating: undefined,
        isSeries: undefined,
      })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText(t('movie.addFavorite'))).toBeTruthy());
    await fireEvent.press(screen.getByLabelText(t('movie.addFavorite')));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalled());
    expect((mockToggleFavorite.mock.calls[0] as any)[0]).toMatchObject({
      id: '99',
      posterUrl: 'https://cdn.example/param.jpg',
    });
  });

  it('selects season with empty episodes falling back to episode 1', async () => {
    mockListEpisodes.mockImplementation((_fl: PlayerFileList, season: number) =>
      season === 2 ? [] : [1, 2]
    );
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ isSeries: true }));
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.season', { n: 2 }))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('movie.season', { n: 2 })));
  });

  it('watch and download no-ops without active player url', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ playerUrl: undefined, nativePlayer: true })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('movie.noPlayer'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await fireEvent.press(screen.getByText(t('common.download')));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId('download-sheet')).toBeNull();
  });

  it('shows actors list when kinopoisk staff empty', async () => {
    mockEnrichFromKinopoisk.mockResolvedValue({
      awards: [],
      staff: [],
      facts: [],
      similar: [],
      related: [],
    });
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ actors: ['A', 'B'], description: 'Plot' })
    );
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('A, B')).toBeTruthy());
  });

  it('navigates similar card without poster', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie());
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText('Similar Two')).toBeTruthy());
    await fireEvent.press(screen.getByText('Similar Two'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ id: 's2' }),
      })
    );
  });

  it('resumes serial progress with time in player url', async () => {
    mockFetchMovieDetail.mockResolvedValue(baseMovie({ isSeries: true, title: 'Serial Show' }));
    mockFetchPlayerFileList.mockResolvedValue(serialFileList);
    mockFetchProgress.mockResolvedValue({
      id: '42_s1e1',
      movieId: '42',
      season: 1,
      episode: 1,
      positionSec: 200,
      durationSec: 600,
      title: 'Serial Show',
      isSeries: true,
      source: 'online',
      updatedAt: 1,
    });
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('common.watch'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(screen.getByTestId('confirm-yes')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockPush.mock.calls[0][0].params.season).toBe('1');
  });

  it('opens player with empty poster and href fallbacks', async () => {
    mockFetchMovieDetail.mockResolvedValue(
      baseMovie({ posterUrl: undefined, href: undefined })
    );
    mockFetchProgress.mockResolvedValue(null);
    await render(<MovieDetailScreen />);
    await waitFor(() => expect(screen.getByText(t('common.watch'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.watch')));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockPush.mock.calls[0][0].params.posterUrl).toBe('');
    expect(mockPush.mock.calls[0][0].params.href).toBe('');
  });
});
