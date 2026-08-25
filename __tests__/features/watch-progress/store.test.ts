const mockRecordHistory = jest.fn(async () => ({ id: 'hist' }));

jest.mock('@/src/features/watch-history/store', () => ({
  useWatchHistoryStore: {
    getState: () => ({
      record: mockRecordHistory,
    }),
  },
}));

jest.mock('@/src/features/watch-progress/db', () => ({
  listWatchProgress: jest.fn(async () => []),
  upsertWatchProgress: jest.fn(async (input) => ({
    id: input.season != null && input.episode != null
      ? `${input.movieId}_s${input.season}e${input.episode}`
      : input.movieId,
    movieId: input.movieId,
    season: input.season,
    episode: input.episode,
    positionSec: input.positionSec,
    durationSec: input.durationSec,
    title: input.title,
    posterUrl: input.posterUrl,
    href: input.href,
    isSeries: !!input.isSeries,
    source: input.source,
    downloadId: input.downloadId,
    updatedAt: Date.now(),
  })),
  deleteWatchProgress: jest.fn(async () => undefined),
  deleteWatchProgressForEpisode: jest.fn(async () => undefined),
  getWatchProgress: jest.fn(async () => null),
  getLatestWatchProgressForMovie: jest.fn(async () => null),
}));

import {
  deleteWatchProgress,
  getLatestWatchProgressForMovie,
  getWatchProgress,
  listWatchProgress,
  upsertWatchProgress,
} from '@/src/features/watch-progress/db';
import {
  fetchLatestProgressForMovie,
  fetchProgress,
  useWatchProgressStore,
} from '@/src/features/watch-progress/store';

describe('watch-progress store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordHistory.mockReset();
    mockRecordHistory.mockResolvedValue({ id: 'hist' });
    useWatchProgressStore.setState({
      items: [],
      hydrated: false,
      saveGenerations: {},
    });
  });

  it('hydrates from db', async () => {
    (listWatchProgress as jest.Mock).mockResolvedValueOnce([
      {
        id: '1',
        movieId: '1',
        positionSec: 10,
        title: 'A',
        isSeries: false,
        source: 'online',
        updatedAt: 2,
      },
    ]);
    await useWatchProgressStore.getState().hydrate();
    expect(useWatchProgressStore.getState().items).toHaveLength(1);
    expect(useWatchProgressStore.getState().hydrated).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveList: (v: unknown) => void = () => undefined;
    (listWatchProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    (listWatchProgress as jest.Mock).mockResolvedValueOnce([
      {
        id: 'after',
        movieId: '2',
        positionSec: 1,
        title: 'B',
        isSeries: false,
        source: 'online',
        updatedAt: 3,
      },
    ]);

    const hydratePromise = useWatchProgressStore.getState().hydrate();
    await useWatchProgressStore.getState().clear('x');
    resolveList([
      {
        id: 'stale',
        movieId: '1',
        positionSec: 1,
        title: 'A',
        isSeries: false,
        source: 'online',
        updatedAt: 1,
      },
    ]);
    await hydratePromise;
    expect(useWatchProgressStore.getState().items[0]?.id).toBe('after');
  });

  it('upserts and stores record sorted by updatedAt', async () => {
    (upsertWatchProgress as jest.Mock)
      .mockResolvedValueOnce({
        id: '1',
        movieId: '1',
        positionSec: 60,
        durationSec: 3600,
        title: 'A',
        isSeries: false,
        source: 'online',
        updatedAt: 10,
      })
      .mockResolvedValueOnce({
        id: '2',
        movieId: '2',
        positionSec: 20,
        durationSec: 3600,
        title: 'B',
        isSeries: false,
        source: 'online',
        updatedAt: 20,
      });
    await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 60,
      durationSec: 3600,
      title: 'A',
      source: 'online',
    });
    await useWatchProgressStore.getState().upsert({
      movieId: '2',
      positionSec: 20,
      durationSec: 3600,
      title: 'B',
      source: 'online',
    });
    expect(useWatchProgressStore.getState().items.map((i) => i.id)).toEqual(['2', '1']);
    expect(useWatchProgressStore.getState().getLatestForMovie('1')?.id).toBe('1');
  });

  it('deletes row when completed', async () => {
    useWatchProgressStore.setState({
      items: [
        {
          id: '1',
          movieId: '1',
          positionSec: 60,
          durationSec: 3600,
          title: 'A',
          isSeries: false,
          source: 'online',
          updatedAt: 1,
        },
      ],
      hydrated: true,
      saveGenerations: { '1': 1 },
    });
    const result = await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 950,
      durationSec: 1000,
      title: 'A',
      source: 'online',
    });
    expect(result).toBeNull();
    expect(deleteWatchProgress).toHaveBeenCalledWith('1');
    expect(useWatchProgressStore.getState().items).toEqual([]);
    expect(useWatchProgressStore.getState().saveGenerations['1']).toBeUndefined();
  });

  it('ignores stale saveGeneration and returns existing item', async () => {
    useWatchProgressStore.setState({
      items: [
        {
          id: '1',
          movieId: '1',
          positionSec: 10,
          title: 'A',
          isSeries: false,
          source: 'online',
          updatedAt: 1,
        },
      ],
      hydrated: true,
      saveGenerations: { '1': 5 },
    });
    const result = await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 60,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 3,
    });
    expect(result?.positionSec).toBe(10);
    expect(upsertWatchProgress).not.toHaveBeenCalled();
  });

  it('returns null for stale generation when item missing', async () => {
    useWatchProgressStore.setState({
      items: [],
      hydrated: true,
      saveGenerations: { '1': 5 },
    });
    const result = await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 60,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 3,
    });
    expect(result).toBeNull();
  });

  it('accepts higher saveGeneration', async () => {
    await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 40,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 1,
    });
    await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 80,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 2,
    });
    expect(useWatchProgressStore.getState().get('1')?.positionSec).toBe(80);
    expect(useWatchProgressStore.getState().saveGenerations['1']).toBe(2);
  });

  it('drops stale write after await when newer generation landed', async () => {
    let resolveUpsert: (v: unknown) => void = () => undefined;
    (upsertWatchProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        })
    );
    (upsertWatchProgress as jest.Mock).mockResolvedValueOnce({
      id: '1',
      movieId: '1',
      positionSec: 99,
      durationSec: 3600,
      title: 'A',
      isSeries: false,
      source: 'online',
      updatedAt: 50,
    });

    const first = useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 1,
    });
    await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 99,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 2,
    });
    resolveUpsert({
      id: '1',
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    });
    const staleResult = await first;
    expect(staleResult?.positionSec).toBe(99);
    expect(useWatchProgressStore.getState().get('1')?.positionSec).toBe(99);
  });

  it('stale write after await returns record when item missing', async () => {
    let resolveUpsert: (v: unknown) => void = () => undefined;
    (upsertWatchProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        })
    );

    const first = useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 1,
    });
    await Promise.resolve();
    useWatchProgressStore.setState({
      items: [],
      saveGenerations: { '1': 5 },
      hydrated: true,
    });
    resolveUpsert({
      id: '1',
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    });
    expect(await first).toMatchObject({ positionSec: 10 });
  });

  it('post-await generation check uses 0 when saveGenerations entry cleared', async () => {
    let resolveUpsert: (v: unknown) => void = () => undefined;
    (upsertWatchProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        })
    );

    const first = useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      source: 'online',
      saveGeneration: 1,
    });
    await Promise.resolve();
    // Clear generation map mid-flight so `?? 0` runs after await.
    useWatchProgressStore.setState({
      items: [],
      saveGenerations: {},
      hydrated: true,
    });
    resolveUpsert({
      id: '1',
      movieId: '1',
      positionSec: 10,
      durationSec: 3600,
      title: 'A',
      isSeries: false,
      source: 'online',
      updatedAt: 1,
    });
    expect(await first).toMatchObject({ positionSec: 10 });
    expect(useWatchProgressStore.getState().get('1')?.positionSec).toBe(10);
  });

  it('clear and clearById remove items and generations', async () => {
    useWatchProgressStore.setState({
      items: [
        {
          id: '1_s1e1',
          movieId: '1',
          season: 1,
          episode: 1,
          positionSec: 40,
          title: 'A',
          isSeries: true,
          source: 'online',
          updatedAt: 1,
        },
        {
          id: '2',
          movieId: '2',
          positionSec: 10,
          title: 'B',
          isSeries: false,
          source: 'online',
          updatedAt: 2,
        },
      ],
      hydrated: true,
      saveGenerations: { '1_s1e1': 1, '2': 2 },
    });
    await useWatchProgressStore.getState().clear('1', 1, 1);
    expect(useWatchProgressStore.getState().items.map((i) => i.id)).toEqual(['2']);
    await useWatchProgressStore.getState().clearById('2');
    expect(useWatchProgressStore.getState().items).toEqual([]);
    expect(useWatchProgressStore.getState().saveGenerations).toEqual({});
  });

  it('fetchProgress helpers delegate to db', async () => {
    (getWatchProgress as jest.Mock).mockResolvedValueOnce({ id: '1' });
    (getLatestWatchProgressForMovie as jest.Mock).mockResolvedValueOnce({ id: '2' });
    expect(await fetchProgress('1', 1, 2)).toEqual({ id: '1' });
    expect(getWatchProgress).toHaveBeenCalledWith('1', 1, 2);
    expect(await fetchLatestProgressForMovie('m')).toEqual({ id: '2' });
    expect(getLatestWatchProgressForMovie).toHaveBeenCalledWith('m');
  });

  it('records watch history and ignores history failures', async () => {
    await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 60,
      durationSec: 3600,
      title: 'A',
      source: 'online',
    });
    expect(mockRecordHistory).toHaveBeenCalledWith(
      expect.objectContaining({ movieId: '1', completed: false })
    );

    mockRecordHistory.mockRejectedValueOnce(new Error('history down'));
    const saved = await useWatchProgressStore.getState().upsert({
      movieId: '2',
      positionSec: 40,
      durationSec: 3600,
      title: 'B',
      source: 'online',
    });
    expect(saved?.movieId).toBe('2');
  });
});
