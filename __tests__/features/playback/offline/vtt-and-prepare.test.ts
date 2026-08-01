import { cueAtTime, parseVtt } from '@/src/features/playback/offline/vtt';
import { ensureFileUri, prepareLocalPlaybackUri } from '@/src/features/playback/offline/prepareLocalSource';
import * as FileSystem from 'expo-file-system/legacy';

describe('parseVtt / cueAtTime', () => {
  const sample = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello

00:00:05.000 --> 00:00:07.500
World
`;

  it('parses cues and strips tags', () => {
    const cues = parseVtt(sample);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 3, text: 'Hello' });
    expect(cues[1].text).toBe('World');
  });

  it('supports cue identifiers and comma timestamps', () => {
    const cues = parseVtt(`WEBVTT

1
00:00:01,000 --> 00:00:02,000
Hi
`);
    expect(cues[0].start).toBe(1);
    expect(cues[0].text).toBe('Hi');
  });

  it('cueAtTime returns active cue or null', () => {
    const cues = parseVtt(sample);
    expect(cueAtTime(cues, 0)).toBeNull();
    expect(cueAtTime(cues, 1)?.text).toBe('Hello');
    expect(cueAtTime(cues, 3)?.text).toBe('Hello');
    expect(cueAtTime(cues, 4)).toBeNull();
    expect(cueAtTime(cues, 6)?.text).toBe('World');
    expect(cueAtTime(cues, 8)).toBeNull();
  });

  it('skips NOTE and empty text', () => {
    expect(parseVtt('WEBVTT\n\nNOTE foo\n\n00:00:01.000 --> 00:00:02.000\n')).toEqual([]);
  });

  it('parses MM:SS timestamps and bare seconds', () => {
    const cues = parseVtt(`WEBVTT

01:30.500 --> 02:00.000
Mid

NOTE skip

orphan block without arrow

9.5 --> 10
Short

bad --> also
Zero
`);
    expect(cues[0].start).toBe(90.5);
    expect(cues[0].end).toBe(120);
    expect(cues[1].start).toBe(9.5);
    expect(cues[1].text).toBe('Short');
    expect(cues[2].start).toBe(0);
  });

  it('skips empty blocks and invalid timestamps', () => {
    expect(parseVtt('WEBVTT\n\n\n\n')).toEqual([]);
    expect(parseVtt('WEBVTT\n\njust text\nno times\n')).toEqual([]);
  });
});

describe('ensureFileUri', () => {
  it('prefixes absolute paths and keeps file://', () => {
    expect(ensureFileUri('/data/a.mp4')).toBe('file:///data/a.mp4');
    expect(ensureFileUri('file:///data/a.mp4')).toBe('file:///data/a.mp4');
    expect(ensureFileUri('')).toBe('');
    expect(ensureFileUri('relative.mp4')).toBe('relative.mp4');
  });
});

describe('prepareLocalPlaybackUri', () => {
  const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
  const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
  const writeAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;

  beforeEach(() => {
    getInfoAsync.mockReset();
    readAsStringAsync.mockReset();
    writeAsStringAsync.mockReset();
  });

  it('passes through progressive', async () => {
    await expect(prepareLocalPlaybackUri('/data/video.mp4', 'progressive')).resolves.toBe(
      'file:///data/video.mp4'
    );
    expect(getInfoAsync).not.toHaveBeenCalled();
  });

  it('returns source when playlist missing', async () => {
    getInfoAsync.mockResolvedValue({ exists: false });
    await expect(
      prepareLocalPlaybackUri('file:///data/index.m3u8', 'hls')
    ).resolves.toBe('file:///data/index.m3u8');
  });

  it('rewrites relative segments and appends ENDLIST', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue(
      ['#EXTM3U', '#EXTINF:1,', 'seg0.ts', '#EXTINF:1,', 'seg1.ts'].join('\n')
    );
    const out = await prepareLocalPlaybackUri('file:///data/dl/index.m3u8', 'hls');
    expect(out).toBe('file:///data/dl/index.absolute.m3u8');
    expect(writeAsStringAsync).toHaveBeenCalled();
    const written = writeAsStringAsync.mock.calls[0][1] as string;
    expect(written).toContain('file:///data/dl/seg0.ts');
    expect(written).toContain('#EXT-X-ENDLIST');
  });

  it('strips BYTERANGE tags and MAP attributes for legacy copies', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue(
      [
        '#EXTM3U',
        '#EXT-X-MAP:URI="init_0.mp4",BYTERANGE="100@0"',
        '#EXTINF:1,',
        '#EXT-X-BYTERANGE:200@100',
        'seg_00001.mp4',
      ].join('\n')
    );
    await prepareLocalPlaybackUri('file:///data/dl/index.m3u8', 'hls');
    const written = writeAsStringAsync.mock.calls[0][1] as string;
    expect(written).toContain('#EXT-X-MAP:URI="file:///data/dl/init_0.mp4"');
    expect(written).not.toMatch(/BYTERANGE/i);
    expect(written).toContain('file:///data/dl/seg_00001.mp4');
  });

  it('keeps blank lines, absolute URIs, existing ENDLIST, and KEY URI rewrite', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue(
      [
        '#EXTM3U',
        '',
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
        '#EXT-X-ENDLIST',
        'file:///data/dl/abs.ts',
        'https://cdn/remote.ts',
        './rel.ts',
      ].join('\n')
    );
    await prepareLocalPlaybackUri('/data/dl/index.m3u8?x=1', 'hls');
    const written = writeAsStringAsync.mock.calls[0][1] as string;
    expect(written).toContain('#EXT-X-KEY:METHOD=AES-128,URI="file:///data/dl/key.bin"');
    expect(written).toContain('file:///data/dl/abs.ts');
    expect(written).toContain('https://cdn/remote.ts');
    expect(written).toContain('file:///data/dl/rel.ts');
    expect(written.match(/#EXT-X-ENDLIST/g)).toHaveLength(1);
  });

  it('joins when directory uri lacks trailing slash and handles query', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue(
      ['#EXTM3U', '#EXTINF:1,', 'seg.ts', '#EXT-X-ENDLIST', ''].join('\n')
    );
    const out = await prepareLocalPlaybackUri('file:///data/dl/index.m3u8?cache=1', 'hls');
    expect(out).toBe('file:///data/dl/index.absolute.m3u8');
    const written = writeAsStringAsync.mock.calls[0][1] as string;
    expect(written).toContain('file:///data/dl/seg.ts');
  });

  it('rewrites relative segments when playlist path has no slash', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue('#EXTM3U\n#EXTINF:1,\nseg.ts\n#EXT-X-ENDLIST\n');
    await prepareLocalPlaybackUri('noslash', 'hls');
    const written = writeAsStringAsync.mock.calls[0][1] as string;
    expect(written).toContain('noslash/seg.ts');
  });
});
