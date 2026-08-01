jest.mock('@/src/watch-progress/db', () => ({
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
  upsertWatchProgress,
} from '@/src/watch-progress/db';
import { useWatchProgressStore } from '@/src/watch-progress/store';

describe('watch-progress store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWatchProgressStore.setState({
      items: [],
      hydrated: false,
      saveGenerations: {},
    });
  });

  it('upserts and stores record', async () => {
    const record = await useWatchProgressStore.getState().upsert({
      movieId: '1',
      positionSec: 60,
      durationSec: 3600,
      title: 'A',
      source: 'online',
    });
    expect(record?.positionSec).toBe(60);
    expect(useWatchProgressStore.getState().items).toHaveLength(1);
    expect(upsertWatchProgress).toHaveBeenCalled();
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
      saveGenerations: {},
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
  });

  it('ignores stale saveGeneration', async () => {
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
    expect(upsertWatchProgress).not.toHaveBeenCalled();
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

  it('clear removes by id', async () => {
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
      ],
      hydrated: true,
      saveGenerations: { '1_s1e1': 1 },
    });
    await useWatchProgressStore.getState().clear('1', 1, 1);
    expect(useWatchProgressStore.getState().items).toEqual([]);
  });
});
