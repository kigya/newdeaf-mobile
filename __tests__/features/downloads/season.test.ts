import {
  episodeRefsFromEmbessHtml,
  episodeRefsFromFsstHtml,
  planSeasonDownload,
} from '@/src/features/downloads/season';
import type { DownloadRecord } from '@/src/features/downloads/types';

function completed(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    movieId: '10',
    title: 'Show',
    audioLabel: 'RU',
    quality: '720',
    subtitleLabel: 'EN',
    status: 'completed',
    progress: 1,
    playlistPath: 'file:///p.m3u8',
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    ...overrides,
  };
}

describe('downloads season', () => {
  it('parses embess and fsst episode refs', () => {
    const embess = `
      seasons: [
        {
          "season": 1,
          "episodes": [
            { "episode": "1", "hls": "https://cdn/e1.m3u8" },
            { "episode": "2", "hls": "https://cdn/e2.m3u8" }
          ]
        }
      ]
    `;
    expect(episodeRefsFromEmbessHtml(embess)).toEqual([
      { season: 1, episode: 1 },
      { season: 1, episode: 2 },
    ]);

    const fsst = `
      file: [
        {"comment":"Кухня 2-1","file":"[720p]https://cdn/e1.mp4"},
        {"comment":"No coords","file":"[720p]https://cdn/x.mp4"}
      ]
    `;
    expect(episodeRefsFromFsstHtml(fsst)).toEqual([{ season: 2, episode: 1 }]);
  });

  it('plans missing episodes, dedupes, and honors limit', () => {
    const episodes = [
      { season: 1, episode: 2 },
      { season: 1, episode: 1 },
      { season: 1, episode: 1 },
      { season: 0, episode: 1 },
      { season: Number.NaN, episode: 1 },
    ];
    const have = [completed({ season: 1, episode: 1 })];
    expect(planSeasonDownload(episodes, have, { movieId: '10' })).toEqual([
      { season: 1, episode: 2 },
    ]);
    expect(
      planSeasonDownload(episodes, have, { movieId: '10', onlyMissing: false, limit: 1 })
    ).toEqual([{ season: 1, episode: 1 }]);
    expect(planSeasonDownload(episodes, [], { movieId: '10', limit: 0 })).toHaveLength(2);
  });
});
