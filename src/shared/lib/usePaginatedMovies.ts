import { useCallback, useEffect, useRef, useState } from 'react';

import type { CatalogPageResult } from '@/src/data/catalog/catalog';
import type { MovieSummary } from '@/src/data/catalog/types';
import { errorMessage } from '@/src/shared/lib/errorMessage';

type FetchPage = (page: number) => Promise<CatalogPageResult>;

type Options = {
  /** Fallback string passed to `errorMessage` when a load fails. */
  loadErrorFallback: string;
  /** Clear the movie list when a replace load fails (GenreListScreen). */
  clearOnReplaceError?: boolean;
  /** Block `loadMore` while `error` is set (GenreListScreen). */
  blockLoadMoreWhenError?: boolean;
};

/**
 * Shared catalog/genre pagination: request coalescing, dedupe-on-append,
 * hasMore, refresh, and load-more.
 */
export function usePaginatedMovies(fetchPage: FetchPage, options: Options) {
  const { loadErrorFallback, clearOnReplaceError = false, blockLoadMoreWhenError = false } =
    options;
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const reqId = ++requestIdRef.current;
      try {
        if (mode === 'replace') setError(null);
        const result = await fetchPage(targetPage);
        if (reqId !== requestIdRef.current) return;

        let appended = 0;
        setMovies((prev) => {
          if (mode === 'replace') return result.items;
          const seen = new Set(prev.map((m) => m.id));
          const next = result.items.filter((m) => !seen.has(m.id));
          appended = next.length;
          return [...prev, ...next];
        });
        if (mode === 'append' && appended === 0) {
          setHasMore(false);
        } else {
          setHasMore(result.hasMore);
        }
        setPage(targetPage);
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        setError(errorMessage(e, loadErrorFallback));
        if (clearOnReplaceError && mode === 'replace') setMovies([]);
      }
    },
    [fetchPage, loadErrorFallback, clearOnReplaceError]
  );

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    void load(1, 'replace').finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(1, 'replace').finally(() => setRefreshing(false));
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading || refreshing) return;
    if (blockLoadMoreWhenError && error) return;
    setLoadingMore(true);
    void load(page + 1, 'append').finally(() => setLoadingMore(false));
  }, [
    hasMore,
    loadingMore,
    loading,
    refreshing,
    blockLoadMoreWhenError,
    error,
    load,
    page,
  ]);

  return {
    movies,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
