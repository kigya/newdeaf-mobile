import { renderHook, waitFor } from '@testing-library/react-native';

import { applyUnlessCancelled, useMovieDetailExtras } from '@/src/screens/movie-detail/useMovieDetailExtras';
import type { MovieDetail } from '@/src/data/catalog/types';

const mockKp = jest.fn();
const mockTmdb = jest.fn();

jest.mock('@/src/data/catalog/kinopoisk', () => ({
  fetchKinopoiskExtras: (...args: unknown[]) => mockKp(...args),
}));

jest.mock('@/src/data/catalog/tmdb', () => ({
  fetchTmdbExtras: (...args: unknown[]) => mockTmdb(...args),
}));

const movie: MovieDetail = {
  id: '1',
  slug: 'film',
  title: 'Film',
  href: '/1-film.html',
  genres: [],
  genreHrefs: [],
  actors: [],
};

describe('useMovieDetailExtras', () => {
  beforeEach(() => {
    mockKp.mockReset();
    mockTmdb.mockReset();
  });

  it('applyUnlessCancelled skips the setter when cancelled', () => {
    const apply = jest.fn();
    applyUnlessCancelled(true, 'x', apply);
    expect(apply).not.toHaveBeenCalled();
    applyUnlessCancelled(false, 'y', apply);
    expect(apply).toHaveBeenCalledWith('y');
  });

  it('loads extras and clears on null movie', async () => {
    mockKp.mockResolvedValue({
      kinopoiskId: 1,
      slogan: 'Go',
      sequels: [],
      youtubeVideos: [],
      reviews: [],
      images: [],
      seasons: [],
      countries: [],
    });
    mockTmdb.mockResolvedValue({ tmdbId: 1, mediaType: 'movie', stills: [], videos: [], cast: [] });
    const { result, rerender } = await renderHook(
      ({ m }: { m: MovieDetail | null }) => useMovieDetailExtras(m),
      { initialProps: { m: movie } }
    );
    await waitFor(() => expect(result.current.kpExtras?.slogan).toBe('Go'));
    expect(result.current.tmdbExtras?.tmdbId).toBe(1);
    rerender({ m: null });
    await waitFor(() => expect(result.current.kpExtras).toBeNull());
  });

  it('swallows extras failures', async () => {
    mockKp.mockRejectedValue(new Error('kp'));
    mockTmdb.mockRejectedValue(new Error('tmdb'));
    const { result } = await renderHook(() => useMovieDetailExtras(movie));
    await waitFor(() => expect(result.current.kpExtras).toBeNull());
    expect(result.current.tmdbExtras).toBeNull();
  });

  it('passes a known kinopoisk id into extras fetch', async () => {
    mockKp.mockResolvedValue(null);
    mockTmdb.mockResolvedValue(null);
    await renderHook(() => useMovieDetailExtras(movie, 42));
    await waitFor(() =>
      expect(mockKp).toHaveBeenCalledWith(expect.objectContaining({ kinopoiskId: 42, title: 'Film' }))
    );
  });

  it('does not apply extras after unmount', async () => {
    let finish: (value: unknown) => void = () => undefined;
    let finishTmdb: (value: unknown) => void = () => undefined;
    const kpPending = new Promise((resolve) => {
      finish = resolve;
    });
    const tmdbPending = new Promise((resolve) => {
      finishTmdb = resolve;
    });
    mockKp.mockReturnValue(kpPending);
    mockTmdb.mockReturnValue(tmdbPending);
    const { unmount } = await renderHook(() => useMovieDetailExtras(movie));
    await waitFor(() => expect(mockKp).toHaveBeenCalled());
    unmount();
    finish({
      kinopoiskId: 1,
      slogan: 'late',
      sequels: [],
      youtubeVideos: [],
      reviews: [],
      images: [],
      seasons: [],
      countries: [],
    });
    finishTmdb({ tmdbId: 1, mediaType: 'movie', stills: [], videos: [], cast: [] });
    await Promise.resolve();
    await Promise.resolve();
  });

  it('does not apply extras failures after unmount', async () => {
    let failKp: (reason: unknown) => void = () => undefined;
    let failTmdb: (reason: unknown) => void = () => undefined;
    const kpPending = new Promise((_, reject) => {
      failKp = reject;
    });
    const tmdbPending = new Promise((_, reject) => {
      failTmdb = reject;
    });
    kpPending.catch(() => undefined);
    tmdbPending.catch(() => undefined);
    mockKp.mockReturnValue(kpPending);
    mockTmdb.mockReturnValue(tmdbPending);
    const { unmount } = await renderHook(() => useMovieDetailExtras(movie));
    await waitFor(() => expect(mockKp).toHaveBeenCalled());
    unmount();
    failKp(new Error('late kp'));
    failTmdb(new Error('late tmdb'));
    await Promise.resolve();
    await Promise.resolve();
  });
});
