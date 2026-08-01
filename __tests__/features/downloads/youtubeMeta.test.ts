import {
  parseHeightLabel,
  pickLargestThumbUrl,
  pickYoutubeiPoster,
  qualityOrDefault,
  resolveVideoTitle,
  youtubeiFormats,
  youtubeiHls,
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

  it('youtubei helpers', () => {
    expect(pickYoutubeiPoster({})).toBeUndefined();
    expect(pickYoutubeiPoster({ basic_info: { thumbnail: [{ url: 'u' }] } })).toBe('u');
    expect(youtubeiFormats({})).toEqual([]);
    expect(youtubeiFormats({ streaming_data: { formats: [1] } })).toEqual([1]);
    expect(youtubeiHls({})).toBeUndefined();
    expect(youtubeiHls({ streaming_data: { hls_manifest_url: 'h' } })).toBe('h');
  });
});
