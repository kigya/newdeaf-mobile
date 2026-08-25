jest.mock('@/src/features/watch-history/db', () => ({
  listWatchHistory: jest.fn(async () => []),
  upsertWatchHistory: jest.fn(async (input) => ({
    id: input.season != null ? `${input.movieId}_s${input.season}e${input.episode}` : input.movieId,
    ...input,
    isSeries: !!input.isSeries,
    watchedAt: 1,
  })),
  deleteWatchHistoryRow: jest.fn(async () => undefined),
}));

import {
  deleteWatchHistoryRow,
  listWatchHistory,
  upsertWatchHistory,
} from '@/src/features/watch-history/db';
import { useWatchHistoryStore } from '@/src/features/watch-history/store';

describe('watch-history store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWatchHistoryStore.setState({ items: [], hydrated: false });
  });

  it('hydrates from db', async () => {
    (listWatchHistory as jest.Mock).mockResolvedValue([
      { id: '1', movieId: '1', title: 'A', source: 'online', positionSec: 1, completed: false, isSeries: false, watchedAt: 1 },
    ]);
    await useWatchHistoryStore.getState().hydrate();
    expect(useWatchHistoryStore.getState().items).toHaveLength(1);
    expect(useWatchHistoryStore.getState().hydrated).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveList: (v: unknown) => void = () => undefined;
    (listWatchHistory as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    (listWatchHistory as jest.Mock).mockResolvedValueOnce([
      { id: 'after', movieId: '2', title: 'B', source: 'online', positionSec: 1, completed: false, isSeries: false, watchedAt: 2 },
    ]);

    const hydratePromise = useWatchHistoryStore.getState().hydrate();
    await useWatchHistoryStore.getState().remove('x');
    resolveList([]);
    await hydratePromise;
    expect(useWatchHistoryStore.getState().items[0]?.id).toBe('after');
  });

  it('record prepends and replaces the same id', async () => {
    await useWatchHistoryStore.getState().record({
      movieId: '1',
      title: 'A',
      source: 'online',
      positionSec: 10,
      completed: false,
    });
    await useWatchHistoryStore.getState().record({
      movieId: '1',
      title: 'A',
      source: 'online',
      positionSec: 20,
      completed: true,
    });
    expect(upsertWatchHistory).toHaveBeenCalledTimes(2);
    expect(useWatchHistoryStore.getState().items).toHaveLength(1);
    expect(useWatchHistoryStore.getState().items[0].positionSec).toBe(20);
  });

  it('remove deletes a row', async () => {
    useWatchHistoryStore.setState({
      items: [
        {
          id: '1',
          movieId: '1',
          title: 'A',
          source: 'online',
          positionSec: 1,
          completed: false,
          isSeries: false,
          watchedAt: 1,
        },
      ],
      hydrated: true,
    });
    await useWatchHistoryStore.getState().remove('1');
    expect(deleteWatchHistoryRow).toHaveBeenCalledWith('1');
    expect(useWatchHistoryStore.getState().items).toEqual([]);
  });
});
