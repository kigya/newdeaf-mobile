import {
  mediaUrlCandidates,
  pickPrimaryMediaUrl,
  resolveUrl,
} from '@/src/features/downloads/urlHelpers';

describe('urlHelpers', () => {
  it('resolveUrl keeps absolute http(s) and protocol-relative', () => {
    expect(resolveUrl('https://cdn/a.m3u8', 'https://other/s.ts')).toBe('https://other/s.ts');
    expect(resolveUrl('https://cdn/a.m3u8', 'http://other/s.ts')).toBe('http://other/s.ts');
    expect(resolveUrl('https://cdn/a.m3u8', '//cdn/s.ts')).toBe('https://cdn/s.ts');
  });

  it('resolveUrl joins relative against valid base', () => {
    expect(resolveUrl('https://cdn.example/path/index.m3u8', 'seg0.ts')).toBe(
      'https://cdn.example/path/seg0.ts'
    );
  });

  it('resolveUrl falls back when base is invalid', () => {
    expect(resolveUrl('not-a-url/base.m3u8', 'seg.ts')).toBe('not-a-url/seg.ts');
    expect(resolveUrl('broken/base.m3u8', '/abs.ts')).toBe('broken/abs.ts');
  });

  it('mediaUrlCandidates and pickPrimaryMediaUrl', () => {
    expect(mediaUrlCandidates('')).toEqual([]);
    expect(mediaUrlCandidates('https://a or https://b')).toEqual(['https://a', 'https://b']);
    expect(pickPrimaryMediaUrl('https://a or https://b')).toBe('https://a');
    expect(pickPrimaryMediaUrl('   ')).toBe('');
  });
});
