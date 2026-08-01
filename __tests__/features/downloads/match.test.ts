import {
  findAnyExistingMovie,
  findExistingSameTracks,
  isMovieDownloaded,
  listCompletedDownloads,
} from '@/src/features/downloads/match';
import type { DownloadRecord } from '@/src/features/downloads/types';

function dl(
  partial: Partial<DownloadRecord> & Pick<DownloadRecord, 'id' | 'movieId' | 'status'>
): DownloadRecord {
  return {
    title: 't',
    progress: 1,
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    playlistPath: 'file:///x/index.m3u8',
    subtitleLabel: 'Subs',
    quality: '720',
    audioLabel: 'Audio',
    ...partial,
  };
}

describe('findExistingSameTracks', () => {
  const items = [
    dl({ id: 'yt', movieId: '10', status: 'completed', source: 'youtube' }),
    dl({ id: 'a', movieId: '10', status: 'completed', audioLabel: ' RU ', subtitleLabel: ' EN ' }),
    dl({ id: 'b', movieId: '10', status: 'queued', audioLabel: 'Other', subtitleLabel: 'EN' }),
    dl({ id: 'c', movieId: '11', status: 'failed', audioLabel: 'RU', subtitleLabel: 'EN' }),
  ];

  it('matches same movie + normalized audio/subtitle across statuses', () => {
    expect(findExistingSameTracks(items, '10', 'ru', 'en')?.id).toBe('a');
    expect(findExistingSameTracks(items, '10', 'Other', 'EN')?.id).toBe('b');
  });

  it('ignores youtube and different movies', () => {
    expect(findExistingSameTracks(items, '10', 'Audio', 'Subs')).toBeUndefined();
    expect(findExistingSameTracks(items, '99', 'RU', 'EN')).toBeUndefined();
  });

  it('includes paused / resolving / downloading / failed', () => {
    const more = [
      dl({ id: 'p', movieId: '1', status: 'paused' as DownloadRecord['status'], audioLabel: 'a', subtitleLabel: 's' }),
      dl({ id: 'r', movieId: '2', status: 'resolving', audioLabel: 'a', subtitleLabel: 's' }),
      dl({ id: 'd', movieId: '3', status: 'downloading', audioLabel: 'a', subtitleLabel: 's' }),
      dl({ id: 'f', movieId: '4', status: 'failed', audioLabel: 'a', subtitleLabel: 's' }),
    ];
    expect(findExistingSameTracks(more, '1', 'a', 's')?.id).toBe('p');
    expect(findExistingSameTracks(more, '2', 'a', 's')?.id).toBe('r');
    expect(findExistingSameTracks(more, '3', 'a', 's')?.id).toBe('d');
    expect(findExistingSameTracks(more, '4', 'a', 's')?.id).toBe('f');
  });
});

describe('findAnyExistingMovie', () => {
  it('returns first non-youtube match for movie', () => {
    const items = [
      dl({ id: 'yt', movieId: '10', status: 'completed', source: 'youtube' }),
      dl({ id: 'm', movieId: '10', status: 'completed' }),
    ];
    expect(findAnyExistingMovie(items, '10')?.id).toBe('m');
    expect(findAnyExistingMovie(items, '99')).toBeUndefined();
  });
});

describe('listCompletedDownloads episode matching', () => {
  it('matches season/episode via movieId fields and prefix', () => {
    const items = [
      dl({
        id: '1',
        movieId: '10',
        status: 'completed',
        season: 1,
        episode: 2,
      }),
      dl({
        id: '2',
        movieId: '10_s1_e2',
        status: 'completed',
        season: 1,
        episode: 2,
      }),
      dl({
        id: '3',
        movieId: '10_s1_e9',
        status: 'completed',
        season: 1,
        episode: 9,
      }),
    ];
    expect(listCompletedDownloads('10', items, 1, 2).map((d) => d.id).sort()).toEqual([
      '1',
      '2',
    ]);
    expect(isMovieDownloaded('10', items)).toBe(true);
  });
});
