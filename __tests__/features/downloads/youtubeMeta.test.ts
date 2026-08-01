import {
  parseHeightLabel,
  pickLargestThumbUrl,
  pickYoutubeiPoster,
  qualityOrDefault,
  resolveVideoTitle,
  youtubeiFormats,
  youtubeiHls,
  firstStreamUrl,
  decipherStreamUrl,
} from '@/src/features/downloads/youtubeMeta';

describe('youtubeMeta', () => {
  it('resolveVideoTitle', () => {
    expect(resolveVideoTitle('  Hi  ', 'id')).toBe('Hi');
    expect(resolveVideoTitle('   ', 'id')).toBe('YouTube id');
    expect(resolveVideoTitle(undefined, 'id')).toBe('YouTube id');
    expect(resolveVideoTitle(null, 'id')).toBe('YouTube id');
  });

  it('parseHeightLabel', () => {
    expect(parseHeightLabel('720p')).toBe(720);
    expect(parseHeightLabel(undefined)).toBe(0);
    expect(parseHeightLabel('nope')).toBe(0);
    expect(parseHeightLabel(null)).toBe(0);
  });

  it('qualityOrDefault', () => {
    expect(qualityOrDefault(1080)).toBe('1080');
    expect(qualityOrDefault(0)).toBe('720');
    expect(qualityOrDefault(undefined)).toBe('720');
    expect(qualityOrDefault(undefined, 480)).toBe('480');
  });

  it('pickLargestThumbUrl', () => {
    expect(pickLargestThumbUrl(undefined)).toBeUndefined();
    expect(pickLargestThumbUrl([])).toBeUndefined();
    expect(
      pickLargestThumbUrl([
        { url: 'a', width: 10 },
        { url: 'b', width: 100 },
      ])
    ).toBe('b');
    expect(pickLargestThumbUrl([{ url: 'c' }])).toBe('c');
    expect(
      pickLargestThumbUrl([
        { url: 'a', width: 0 },
        { url: 'b', width: undefined },
      ])
    ).toBe('a');
  });

  it('firstStreamUrl', () => {
    expect(firstStreamUrl('a', 'b')).toBe('a');
    expect(firstStreamUrl('', 'b')).toBe('b');
    expect(firstStreamUrl(undefined, 'b')).toBe('b');
  });

  it('youtubeiFormats falls back to empty array', () => {
    expect(youtubeiFormats({})).toEqual([]);
    expect(youtubeiFormats({ streaming_data: {} })).toEqual([]);
    expect(youtubeiFormats({ streaming_data: { formats: undefined } })).toEqual([]);
    expect(youtubeiFormats({ streaming_data: { formats: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
  });

  it('youtubeiHls and pickYoutubeiPoster', () => {
    expect(youtubeiHls({})).toBeUndefined();
    expect(youtubeiHls({ streaming_data: { hls_manifest_url: 'https://m3u8' } })).toBe(
      'https://m3u8'
    );
    expect(pickYoutubeiPoster({})).toBeUndefined();
    expect(
      pickYoutubeiPoster({ basic_info: { thumbnail: [{ url: 'https://img' }] } })
    ).toBe('https://img');
  });

  it('decipherStreamUrl success and failure', async () => {
    await expect(decipherStreamUrl(async () => 'https://yt/x.mp4')).resolves.toBe(
      'https://yt/x.mp4'
    );
    await expect(decipherStreamUrl(async () => undefined)).resolves.toBe('');
    await expect(decipherStreamUrl(async () => '')).resolves.toBe('');
    await expect(
      decipherStreamUrl(async () => {
        throw new Error('fail');
      })
    ).resolves.toBe('');
  });
});
