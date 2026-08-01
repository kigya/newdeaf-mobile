import {
  mediaUrlCandidates,
  pickPrimaryMediaUrl,
  pickSubtitleTrack,
  resolveMediaUrl,
} from '@/src/features/downloads/hls';
import { isMovieDownloaded, listCompletedDownloads } from '@/src/features/downloads/match';
import type { DownloadRecord } from '@/src/features/downloads/types';

jest.mock('youtubei.js/react-native', () => ({
  Innertube: { create: jest.fn() },
}));

import { extractYoutubeVideoId } from '@/src/features/downloads/youtube';

function dl(partial: Partial<DownloadRecord> & Pick<DownloadRecord, 'id' | 'movieId' | 'status'>): DownloadRecord {
  return {
    title: 't',
    progress: 1,
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    playlistPath: 'file:///x/index.m3u8',
    subtitleLabel: '',
    quality: '720',
    audioLabel: 'a',
    ...partial,
  };
}

describe('mediaUrlCandidates / pickPrimaryMediaUrl', () => {
  it('splits failover "a or b"', () => {
    expect(mediaUrlCandidates('https://a/m.m3u8 or https://b/m.m3u8')).toEqual([
      'https://a/m.m3u8',
      'https://b/m.m3u8',
    ]);
    expect(pickPrimaryMediaUrl('https://a/m.m3u8 or https://b/m.m3u8')).toBe(
      'https://a/m.m3u8'
    );
  });

  it('handles empty and single url', () => {
    expect(mediaUrlCandidates('')).toEqual([]);
    expect(mediaUrlCandidates('https://only/one')).toEqual(['https://only/one']);
    expect(pickPrimaryMediaUrl('  ')).toBe('');
  });
});

describe('resolveMediaUrl', () => {
  it('joins relative segment against playlist base', () => {
    expect(resolveMediaUrl('https://cdn.example/path/index.m3u8', 'seg0.ts')).toBe(
      'https://cdn.example/path/seg0.ts'
    );
  });

  it('keeps absolute segment urls', () => {
    expect(resolveMediaUrl('https://cdn.example/a.m3u8', 'https://other/s.ts')).toBe(
      'https://other/s.ts'
    );
  });

  it('resolves protocol-relative and http absolute', () => {
    expect(resolveMediaUrl('https://cdn.example/a.m3u8', '//cdn.example/s.ts')).toBe(
      'https://cdn.example/s.ts'
    );
    expect(resolveMediaUrl('https://cdn.example/a.m3u8', 'http://other/s.ts')).toBe(
      'http://other/s.ts'
    );
  });

  it('falls back when base is not a valid URL', () => {
    expect(resolveMediaUrl('not-a-url/base.m3u8', 'seg.ts')).toBe('not-a-url/seg.ts');
    expect(resolveMediaUrl('broken/base.m3u8', '/abs.ts')).toBe('broken/abs.ts');
  });
});


describe('pickSubtitleTrack', () => {
  it('returns null for empty', () => {
    expect(pickSubtitleTrack([])).toBeNull();
  });

  it('prefers russian full then russian then first', () => {
    expect(
      pickSubtitleTrack([
        { label: 'English', src: 'e' },
        { label: 'Русские полные', src: 'rf' },
        { label: 'Русские', src: 'r' },
      ])?.src
    ).toBe('rf');

    expect(
      pickSubtitleTrack([
        { label: 'English', src: 'e' },
        { label: 'Русские', src: 'r' },
      ])?.src
    ).toBe('r');

    expect(
      pickSubtitleTrack([
        { label: 'English Full', src: 'e' },
        { label: 'Deutsch', src: 'd' },
      ])?.src
    ).toBe('e');
  });
});

describe('listCompletedDownloads / isMovieDownloaded', () => {
  const items = [
    dl({ id: '1', movieId: '10', status: 'completed' }),
    dl({ id: '2', movieId: '10_s1_e2', status: 'completed', season: 1, episode: 2 }),
    dl({ id: '3', movieId: '10', status: 'failed' }),
    dl({ id: '4', movieId: '10', status: 'completed', source: 'youtube', youtubeUrl: 'x' }),
    dl({ id: '5', movieId: '10', status: 'completed', playlistPath: undefined }),
    dl({ id: '6', movieId: '99', status: 'completed' }),
  ];

  it('matches catalog movie including episode suffixes', () => {
    expect(listCompletedDownloads('10', items).map((d) => d.id).sort()).toEqual(['1', '2']);
    expect(isMovieDownloaded('10', items)).toBe(true);
    expect(isMovieDownloaded('11', items)).toBe(false);
  });

  it('filters by season/episode when provided', () => {
    expect(listCompletedDownloads('10', items, 1, 2).map((d) => d.id)).toEqual(['2']);
    expect(listCompletedDownloads('10', items, 1, 9)).toEqual([]);
  });

  it('ignores youtube and missing playlist', () => {
    expect(listCompletedDownloads('10', items).some((d) => d.id === '4')).toBe(false);
    expect(listCompletedDownloads('10', items).some((d) => d.id === '5')).toBe(false);
  });
});

describe('extractYoutubeVideoId', () => {
  it('accepts bare 11-char ids', () => {
    expect(extractYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses watch / youtu.be / shorts', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('returns null for invalid input', () => {
    expect(extractYoutubeVideoId('')).toBeNull();
    expect(extractYoutubeVideoId('not-a-url')).toBeNull();
    expect(extractYoutubeVideoId('https://example.com')).toBeNull();
  });
});
