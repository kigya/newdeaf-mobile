import { renderHook, act, waitFor } from '@testing-library/react-native';

import { usePaginatedMovies } from '@/src/shared/lib/usePaginatedMovies';
import type { MovieSummary } from '@/src/data/catalog/types';

function movie(id: string): MovieSummary {
  return { id, slug: id, title: `T${id}`, href: `/${id}.html` };
}

describe('usePaginatedMovies', () => {
  it('loads first page on mount', async () => {
    const fetchPage = jest.fn(async () => ({
      items: [movie('1'), movie('2')],
      hasMore: true,
    }));

    const { result } = await renderHook(() =>
      usePaginatedMovies(fetchPage, { loadErrorFallback: 'load failed' })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movies).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(1);
  });

  it('appends unique items on loadMore and stops when empty append', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ items: [movie('1')], hasMore: true })
      .mockResolvedValueOnce({ items: [movie('1'), movie('2')], hasMore: true })
      .mockResolvedValueOnce({ items: [movie('1')], hasMore: true });

    const { result } = await renderHook(() =>
      usePaginatedMovies(fetchPage, { loadErrorFallback: 'err' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.movies.map((m) => m.id)).toEqual(['1', '2']);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });

  it('refresh reloads page 1', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ items: [movie('1')], hasMore: false })
      .mockResolvedValueOnce({ items: [movie('9')], hasMore: false });

    const { result } = await renderHook(() =>
      usePaginatedMovies(fetchPage, { loadErrorFallback: 'err' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.movies[0].id).toBe('9');
  });

  it('sets error and optionally clears on replace failure', async () => {
    const fetchPage = jest.fn(async () => {
      throw new Error('network');
    });

    const { result } = await renderHook(() =>
      usePaginatedMovies(fetchPage, {
        loadErrorFallback: 'fallback',
        clearOnReplaceError: true,
        blockLoadMoreWhenError: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network');
    expect(result.current.movies).toEqual([]);

    await act(async () => {
      result.current.loadMore();
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('uses fallback message for non-Error throws', async () => {
    const fetchPage = jest.fn(async () => {
      throw 'x';
    });
    const { result } = await renderHook(() =>
      usePaginatedMovies(fetchPage, { loadErrorFallback: 'fallback' })
    );
    await waitFor(() => expect(result.current.error).toBe('fallback'));
  });

  it('ignores stale replace responses', async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    const fetchPage = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ items: [movie('fresh')], hasMore: false });

    const { result, rerender } = await renderHook(
      ({ fetcher }) => usePaginatedMovies(fetcher, { loadErrorFallback: 'err' }),
      { initialProps: { fetcher: fetchPage } }
    );

    const fetchPage2 = jest.fn(async () => ({ items: [movie('fresh')], hasMore: false }));
    rerender({ fetcher: fetchPage2 });
    await waitFor(() => expect(result.current.movies[0]?.id).toBe('fresh'));

    resolveFirst({ items: [movie('stale')], hasMore: true });
    await act(async () => {});
    expect(result.current.movies[0]?.id).toBe('fresh');
  });

  it('ignores stale error from superseded request', async () => {
    let rejectFirst: (e: unknown) => void = () => undefined;
    const fetchPage = jest.fn().mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
    );

    const { result, rerender } = await renderHook(
      ({ fetcher }) =>
        usePaginatedMovies(fetcher, {
          loadErrorFallback: 'err',
          clearOnReplaceError: true,
        }),
      { initialProps: { fetcher: fetchPage } }
    );

    const fetchPage2 = jest.fn(async () => ({ items: [movie('ok')], hasMore: false }));
    rerender({ fetcher: fetchPage2 });
    await waitFor(() => expect(result.current.movies[0]?.id).toBe('ok'));
    rejectFirst(new Error('stale'));
    await act(async () => {});
    expect(result.current.error).toBeNull();
  });
});
