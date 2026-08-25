import { renderHook, waitFor } from '@testing-library/react-native';

import { useMovieDetailExtras } from '@/src/screens/movie-detail/useMovieDetailExtras';
import type { MovieDetail } from '@/src/data/catalog/types';

jest.mock('@/src/data/catalog/kinopoisk', () => ({
  fetchKinopoiskExtras: 'not-a-function',
}));

jest.mock('@/src/data/catalog/tmdb', () => ({}));

const movie: MovieDetail = {
  id: '1',
  slug: 'film',
  title: 'Film',
  href: '/1-film.html',
  genres: [],
  genreHrefs: [],
  actors: [],
};

describe('useMovieDetailExtras missing fetchers', () => {
  it('resolves null when extras fetchers are not functions', async () => {
    const { result } = await renderHook(() => useMovieDetailExtras(movie));
    await waitFor(() => expect(result.current.kpExtras).toBeNull());
    expect(result.current.tmdbExtras).toBeNull();
  });
});
