import {
  base64DecodedLength,
  isByteRangeTag,
  parseByteRangeSpec,
  planHlsOfflineDownload,
  stripByteRangeAttribute,
} from '@/src/features/downloads/hlsPlaylist';

describe('parseByteRangeSpec', () => {
  it('parses length and optional offset', () => {
    expect(parseByteRangeSpec('1234')).toEqual({ offset: 0, length: 1234 });
    expect(parseByteRangeSpec('5000@1000')).toEqual({ offset: 1000, length: 5000 });
  });

  it('rejects invalid specs', () => {
    expect(parseByteRangeSpec('')).toBeNull();
    expect(parseByteRangeSpec('0')).toBeNull();
    expect(parseByteRangeSpec('-1@0')).toBeNull();
    expect(parseByteRangeSpec('abc')).toBeNull();
  });
});

describe('stripByteRangeAttribute', () => {
  it('removes BYTERANGE from MAP lines', () => {
    expect(
      stripByteRangeAttribute('#EXT-X-MAP:URI="init.mp4",BYTERANGE="734@0"')
    ).toBe('#EXT-X-MAP:URI="init.mp4"');
  });
});

describe('base64DecodedLength', () => {
  it('matches atob length', () => {
    expect(base64DecodedLength(btoa('hi'))).toBe(2);
    expect(base64DecodedLength(btoa('hel'))).toBe(3);
    expect(base64DecodedLength('')).toBe(0);
    expect(base64DecodedLength('YQ==')).toBe(1);
    expect(base64DecodedLength('YWI=')).toBe(2);
  });
});

describe('isByteRangeTag', () => {
  it('detects EXT-X-BYTERANGE lines', () => {
    expect(isByteRangeTag('#EXT-X-BYTERANGE:100@0')).toBe(true);
    expect(isByteRangeTag('  #ext-x-byterange:50  ')).toBe(true);
    expect(isByteRangeTag('#EXTINF:1,')).toBe(false);
  });
});

describe('planHlsOfflineDownload', () => {
  it('plans mpeg-ts without ranges', () => {
    const { jobs, rewrittenLines } = planHlsOfflineDownload(
      ['#EXTM3U', '#EXTINF:1,', 'a.ts', '#EXTINF:1,', 'b.ts'].join('\n'),
      'https://cdn.example/path/index.m3u8'
    );
    expect(jobs).toEqual([
      { remoteUrl: 'https://cdn.example/path/a.ts', localName: 'seg_00000.ts' },
      { remoteUrl: 'https://cdn.example/path/b.ts', localName: 'seg_00001.ts' },
    ]);
    expect(rewrittenLines).toContain('seg_00000.ts');
    expect(rewrittenLines).toContain('#EXT-X-ENDLIST');
    expect(rewrittenLines.some((l) => l.includes('BYTERANGE'))).toBe(false);
  });

  it('materializes EXT-X-BYTERANGE into sliced jobs and strips tags', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-MAP:URI="main.mp4",BYTERANGE="100@0"',
      '#EXTINF:4.0,',
      '#EXT-X-BYTERANGE:200@100',
      'main.mp4',
      '#EXTINF:4.0,',
      '#EXT-X-BYTERANGE:300@300',
      'main.mp4',
    ].join('\n');

    const { jobs, rewrittenLines } = planHlsOfflineDownload(
      playlist,
      'https://cdn.example/vod/index.m3u8'
    );

    expect(jobs).toEqual([
      {
        remoteUrl: 'https://cdn.example/vod/main.mp4',
        localName: 'init_0.mp4',
        byteRange: { offset: 0, length: 100 },
      },
      {
        remoteUrl: 'https://cdn.example/vod/main.mp4',
        localName: 'seg_00001.mp4',
        byteRange: { offset: 100, length: 200 },
      },
      {
        remoteUrl: 'https://cdn.example/vod/main.mp4',
        localName: 'seg_00002.mp4',
        byteRange: { offset: 300, length: 300 },
      },
    ]);

    expect(rewrittenLines).toEqual([
      '#EXTM3U',
      '#EXT-X-MAP:URI="init_0.mp4"',
      '#EXTINF:4.0,',
      'seg_00001.mp4',
      '#EXTINF:4.0,',
      'seg_00002.mp4',
      '#EXT-X-ENDLIST',
    ]);
  });

  it('plans KEY / m4s / ts / bin MAP extensions and keeps existing ENDLIST', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-ENDLIST',
      '#EXT-X-KEY:METHOD=AES-128,URI="crypt.key"',
      '#EXT-X-MAP:URI="init.m4s"',
      '#EXT-X-MAP:URI="init2.ts"',
      '#EXT-X-MAP:URI="init3.bin"',
      '#EXTINF:1,',
      'seg.m4s',
    ].join('\n');
    const { jobs, rewrittenLines } = planHlsOfflineDownload(
      playlist,
      'https://cdn.example/vod/index.m3u8'
    );
    expect(jobs.some((j) => j.localName.startsWith('key_') && j.localName.endsWith('.key'))).toBe(
      true
    );
    expect(jobs.some((j) => j.localName === 'init_1.m4s')).toBe(true);
    expect(jobs.some((j) => j.localName === 'init_2.ts')).toBe(true);
    expect(jobs.some((j) => j.localName === 'init_3.bin')).toBe(true);
    expect(rewrittenLines.filter((l) => l === '#EXT-X-ENDLIST')).toHaveLength(1);
  });

  it('plans MAP without BYTERANGE and KEY with BYTERANGE attr', () => {
    const { jobs } = planHlsOfflineDownload(
      [
        '#EXTM3U',
        '#EXT-X-KEY:METHOD=AES-128,URI="k.bin",BYTERANGE="16@0"',
        '#EXTINF:1,',
        'plain.ts',
      ].join('\n'),
      'https://cdn.example/i.m3u8'
    );
    expect(jobs[0]).toMatchObject({
      localName: 'key_0.key',
      byteRange: { offset: 0, length: 16 },
    });
    expect(jobs[1].localName).toBe('seg_00001.ts');
  });
});
