import {
  bucketQualityLabel,
  buildEmbessStreamPayload,
  canonicalizeEmbedFetchUrl,
  extractBalancedArray,
  extractBalancedObject,
  isEmbessPlayerUrl,
  isFsstPlayerUrl,
  isFsstPlaylistUrl,
  isProgressiveMediaUrl,
  isResolvableEmbedUrl,
  isVenomEmbedUrl,
  matchAudioPlaylistUri,
  parseEmbessPlaylistEpisodes,
  parseEmbessSource,
  pickEmbessPlaylistEpisode,
  pickVenomEmbedUrl,
  parseFsstEpisodeComment,
  parseFsstPlaylistEpisodes,
  parseFsstProgressiveSources,
  parseMasterPlaylist,
  resolveEmbedStream,
  resolveEmbessStream,
  resolveFsstStream,
} from '@/src/data/catalog/embedStreams';

jest.mock('@/src/shared/lib/webviewHtmlFetch', () => ({
  isWebViewHtmlFetcherReady: jest.fn(() => false),
  fetchHtmlViaWebView: jest.fn(async () => {
    throw new Error('WebView HTML fetcher not ready');
  }),
}));

const EMBESS_HTML = `
<html><body><script>
makePlayer({
  title: "Test Movie",
  source: {
    hls: "https://cdn.example/master.m3u8?x=1",
    audio: {"names":["MovieDalen","TVShows","LostFilm","Eng.Original","Postmodern","delete"],"order":[0,1,2,4,3,5]},
    cc: [{"url":"https://cdn.example/ru.vtt","name":"Рус. полные"},{"url":"https://cdn.example/en.vtt","name":"Eng. full"}]
  }
});
</script></body></html>
`;

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="rus0",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="ru",URI="https://cdn.example/a1.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="rus1",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="ru",URI="https://cdn.example/a2.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="rus2",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="ru",URI="https://cdn.example/a3.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="eng3",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",URI="https://cdn.example/a4.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="ukr4",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="uk",URI="https://cdn.example/a5.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="eng5",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",URI="https://cdn.example/a6.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="failover-audio-0",NAME="rus0",DEFAULT=YES,URI="https://failover.example/a1.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x534,AUDIO="audio0"
https://cdn.example/v1.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x534,AUDIO="failover-audio-0"
https://failover.example/v1.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x266,AUDIO="audio0"
https://cdn.example/v2.m3u8
`;

describe('embedStreams helpers', () => {
  it('detects embess / fsst / resolvable URLs', () => {
    expect(isEmbessPlayerUrl('https://api.embess.ws/embed/movie/1')).toBe(true);
    expect(isEmbessPlayerUrl('https://api.namy.ws/embed/movie/1')).toBe(true);
    expect(isEmbessPlayerUrl('https://api.domem.ws/embed/movie/1')).toBe(true);
    expect(isEmbessPlayerUrl('https://evil.com')).toBe(false);
    expect(isEmbessPlayerUrl('not a url embess.ws')).toBe(true);
    expect(isEmbessPlayerUrl('not a url namy.ws')).toBe(true);
    expect(isVenomEmbedUrl('not a url domem.ws')).toBe(true);
    expect(isVenomEmbedUrl('https://embess.ws/e/1')).toBe(true);
    expect(isVenomEmbedUrl('https://namy.ws/e/1')).toBe(true);
    expect(isVenomEmbedUrl('https://domem.ws/e/1')).toBe(true);
    expect(isVenomEmbedUrl('https://embess.ws.evil.com/x')).toBe(false);
    expect(
      pickVenomEmbedUrl([
        'https://api.namy.ws/embed/1',
        'https://api.embess.ws/embed/1',
        'https://api.domem.ws/embed/1',
      ])
    ).toContain('embess.ws');
    expect(pickVenomEmbedUrl(['https://stloadi.live/x'])).toBeUndefined();
    expect(isFsstPlayerUrl('https://fsst.online/embed/1')).toBe(true);
    expect(isFsstPlayerUrl('https://www.incvideo1.online/x')).toBe(true);
    expect(isFsstPlayerUrl('not-a-url fsst.online')).toBe(true);
    expect(isFsstPlaylistUrl('https://fsst.online/playlist_iframe/17980/')).toBe(true);
    expect(isProgressiveMediaUrl('https://cdn/x.mp4?t=1')).toBe(true);
    expect(isProgressiveMediaUrl('https://cdn/master.m3u8')).toBe(false);
    expect(
      isProgressiveMediaUrl(
        'https://cdn.example/clip.mp4/master.m3u8?sig=1'
      )
    ).toBe(false);
    expect(isProgressiveMediaUrl('https://cdn/get_file/20/x_360p.mp4')).toBe(true);
    expect(isResolvableEmbedUrl('https://api.embess.ws/x')).toBe(true);
    expect(isResolvableEmbedUrl('https://api.namy.ws/embed/1')).toBe(true);
    expect(isResolvableEmbedUrl('https://stloadi.live/x')).toBe(false);
    expect(parseFsstEpisodeComment('Кухня 2-1')).toEqual({ season: 2, episode: 1 });
    expect(parseFsstEpisodeComment('Кухня 2 - 12')).toEqual({ season: 2, episode: 12 });
    expect(parseFsstPlaylistEpisodes('<html></html>')).toEqual([]);
  });

  it('extracts balanced objects with nested braces and strings', () => {
    const src = `prefix { a: { b: "}" }, c: 1 } tail`;
    const open = src.indexOf('{');
    expect(extractBalancedObject(src, open)).toBe('{ a: { b: "}" }, c: 1 }');
    expect(extractBalancedObject('nope', 0)).toBeNull();
    expect(extractBalancedObject('{ "a\\": 1", b: 2 }', 0)).toContain('b: 2');
    expect(extractBalancedObject('{ unterminated', 0)).toBeNull();
  });

  it('extracts balanced arrays and parses VenomPlayer episode playlists', () => {
    expect(extractBalancedArray('[1, [2], "a]"]', 0)).toBe('[1, [2], "a]"]');
    expect(extractBalancedArray('nope', 0)).toBeNull();
    expect(extractBalancedArray('[ unterminated', 0)).toBeNull();
    expect(parseEmbessPlaylistEpisodes('<html></html>')).toEqual([]);
    expect(parseEmbessPlaylistEpisodes('seasons: [not-json')).toEqual([]);
    expect(parseEmbessPlaylistEpisodes('seasons: [not json]')).toEqual([]);
    expect(parseEmbessPlaylistEpisodes('seasons: {"nope":1}')).toEqual([]);
    expect(parseEmbessPlaylistEpisodes('seasons: [1,2]')).toEqual([]);

    const html = `
      makePlayer({
        playlist: {
          seasons: [
            {
              "season": 1,
              "episodes": [
                {
                  "episode": "1",
                  "hls": "https://cdn.example/e1/master.m3u8",
                  "audio": { "names": ["Eng.Original", "HDRezka"], "order": [0, 1] },
                  "cc": [{ "url": "https://cdn.example/e1.ru.vtt", "name": "Рус. полные" }]
                },
                {
                  "episode": "2",
                  "hls": "https://cdn.example/e2/master.m3u8",
                  "audio": { "names": ["Eng.Original"], "order": [] }
                },
                { "episode": "3" }
              ]
            }
          ]
        }
      });
    `;
    const episodes = parseEmbessPlaylistEpisodes(html);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({
      season: 1,
      episode: 1,
      source: { hls: 'https://cdn.example/e1/master.m3u8' },
    });
    expect(episodes[0].source.audio.names).toEqual(['Eng.Original', 'HDRezka']);
    expect(episodes[0].source.cc[0].name).toBe('Рус. полные');
    expect(pickEmbessPlaylistEpisode(episodes, 1, 2)?.source.hls).toContain('/e2/');
    expect(pickEmbessPlaylistEpisode(episodes, 9, 9)?.source.hls).toContain('/e1/');
    expect(pickEmbessPlaylistEpisode(episodes)?.source.hls).toContain('/e1/');
    expect(pickEmbessPlaylistEpisode([], 1, 1)).toBeUndefined();
  });

  it('skips invalid VenomPlayer playlist seasons, episodes, and captions', () => {
    const html = `
      seasons: [
        { "season": 0, "episodes": [{ "episode": "1", "hls": "https://cdn/skip.m3u8" }] },
        { "season": 1, "episodes": "nope" },
        {
          "season": 1,
          "episodes": [
            {
              "episode": "1",
              "hls": "https://cdn.example/ok.m3u8",
              "audio": { "names": ["A"], "order": [] },
              "cc": [null, { "name": "no-url" }, { "url": "https://cdn/ok.vtt", "name": "OK" }]
            },
            { "episode": "0", "hls": "https://cdn.example/zero.m3u8" },
            { "episode": "x", "hls": "https://cdn.example/nan.m3u8" },
            { "episode": "2", "hls": "https://cdn.example/e2.m3u8" },
            {
              "episode": "3",
              "hls": "https://cdn.example/e3.m3u8",
              "cc": [{ "url": "https://cdn/noname.vtt" }]
            }
          ]
        }
      ]
    `;
    const episodes = parseEmbessPlaylistEpisodes(html);
    expect(episodes).toHaveLength(3);
    expect(episodes[0].source.cc).toEqual([{ url: 'https://cdn/ok.vtt', name: 'OK' }]);
    expect(episodes[0].source.audio.order).toEqual([0]);
    expect(episodes[1].source.audio.names).toEqual([]);
    expect(episodes[2].source.cc[0]).toEqual({ url: 'https://cdn/noname.vtt', name: '' });
  });

  it('parses cc entries with name-before-url order', () => {
    const html = `
      makePlayer({
        source: {
          hls: "https://cdn.example/master.m3u8",
          audio: { names: ["A"], order: [0] },
          cc: [{ name: "EN", url: "https://cdn.example/en.vtt" }]
        }
      });
    `;
    const source = parseEmbessSource(html);
    expect(source?.cc).toEqual([{ url: 'https://cdn.example/en.vtt', name: 'EN' }]);
  });

  it('parses embess makePlayer source', () => {
    const source = parseEmbessSource(EMBESS_HTML);
    expect(source).not.toBeNull();
    expect(source!.hls).toContain('master.m3u8');
    expect(source!.audio.names).toEqual([
      'MovieDalen',
      'TVShows',
      'LostFilm',
      'Eng.Original',
      'Postmodern',
      'delete',
    ]);
    expect(source!.audio.order).toEqual([0, 1, 2, 4, 3, 5]);
    expect(source!.cc).toHaveLength(2);
    expect(source!.cc[0].name).toMatch(/полн/i);
  });

  it('ignores function makePlayer(opts) definition before the call site', () => {
    const html = `
      function makePlayer(opts) { return opts; }
      makePlayer({
        source: {
          hls: "https://cdn.example/live.m3u8",
          audio: { names: ["A"], order: [0] },
          cc: [{ url: "https://cdn/ru.vtt", name: "Рус. полные" }]
        }
      });
    `;
    const source = parseEmbessSource(html);
    expect(source?.hls).toContain('live.m3u8');
    expect(source?.cc[0].name).toMatch(/полн/i);
  });

  it('returns null when makePlayer missing', () => {
    expect(parseEmbessSource('<html></html>')).toBeNull();
  });

  it('covers parseEmbessSource failure branches', () => {
    expect(parseEmbessSource('makePlayer(')).toBeNull();
    expect(parseEmbessSource('makePlayer({ unterminated')).toBeNull();
    expect(parseEmbessSource('makePlayer({ title: "x" })')).toBeNull();
    expect(parseEmbessSource('makePlayer({ source: 1 })')).toBeNull();
    expect(
      parseEmbessSource('makePlayer({ source: { audio: { names: ["A"] } } })')
    ).toBeNull();
    expect(
      parseEmbessSource('makePlayer({ source: { hls: "" } })')
    ).toBeNull();
    expect(
      parseEmbessSource('makePlayer({ source: { hls: "   " } })')
    ).toBeNull();
    // no audio block
    expect(
      parseEmbessSource('makePlayer({ source: { hls: "https://cdn/m.m3u8", cc: [] } })')?.audio
        .names
    ).toEqual([]);
    // audio without brace / unclosed / names missing
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: 1, cc: [] } })'
      )?.audio.names
    ).toEqual([]);
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { order: [0] }, cc: [] } })'
      )?.audio.names
    ).toEqual([]);
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"'
      )
    ).toBeNull();
    // cc without array / unclosed
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"] }, cc: 1 } })'
      )?.cc
    ).toEqual([]);
    // Unclosed cc array inside balanced braces → empty cc
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"] }, cc: [ } })'
      )?.cc
    ).toEqual([]);
    // Nested cc arrays still extract entries
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"] }, cc: [[{ url: "https://x", name: "Y" }]] } })'
      )?.cc
    ).toEqual([{ url: 'https://x', name: 'Y' }]);
    expect(
      parseEmbessSource(
        'makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"] }, cc: [{ url: "x"'
      )
    ).toBeNull();
    // names without order → map indices
    const src = parseEmbessSource(
      `makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { "names": ["A","B"] }, cc: [] } })`
    );
    expect(src?.audio.order).toEqual([0, 1]);
    // single-quoted strings in names (incl. empty)
    const src2 = parseEmbessSource(
      `makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ['Solo', ''] } } })`
    );
    expect(src2?.audio.names).toEqual(['Solo', '']);
    // empty cc name → CC label via payload
    const src3 = parseEmbessSource(
      `makePlayer({ source: { hls: "https://cdn/m.m3u8", audio: { names: ["A"], order: [0] }, cc: [{ url: "https://cdn/x.vtt", name: "" }] } })`
    );
    const payload = buildEmbessStreamPayload(src3!, '#EXTM3U\n', src3!.hls)!;
    expect(payload.tracks[0].label).toBe('CC');
  });

  it('parses master with relative URIs and empty group ids', () => {
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="",NAME="a0",URI="a0.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="g",NAME="",URI="skip.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="g",NAME="no-uri"
#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360,AUDIO=""
v.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2
#EXT-X-ENDLIST
#EXT-X-STREAM-INF:RESOLUTION=640x360
nobw.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3,AUDIO="audio0"
bare.m3u8
`;
    const { audioTracks, variants } = parseMasterPlaylist(master, 'https://cdn.example/master.m3u8');
    expect(audioTracks[0].uri).toContain('https://cdn.example/a0.m3u8');
    expect(audioTracks).toHaveLength(1);
    expect(variants[0].uri).toContain('https://cdn.example/v.m3u8');
    expect(variants.find((v) => v.uri.includes('nobw.m3u8'))?.bandwidth).toBe(0);
    expect(variants.some((v) => v.uri.includes('bare.m3u8'))).toBe(true);
    expect(variants.every((v) => !v.uri.startsWith('#'))).toBe(true);
  });

  it('keeps higher bandwidth when same quality bucket collides', () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720
high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=1280x720
low.m3u8
`;
    const payload = buildEmbessStreamPayload(
      { hls: 'https://cdn.example/m.m3u8', audio: { names: ['A'], order: [0] }, cc: [] },
      master,
      'https://cdn.example/m.m3u8'
    )!;
    expect(payload.hlsSource[0].quality['720']).toBe('https://cdn.example/m.m3u8');
  });

  it('buckets zero resolution to 240', () => {
    expect(bucketQualityLabel(0, 0)).toBe('240');
  });

  it('buildEmbessStreamPayload uses names map when order empty', () => {
    const payload = buildEmbessStreamPayload(
      {
        hls: 'https://cdn.example/m.m3u8',
        audio: { names: ['Only'], order: [] },
        cc: [],
      },
      '#EXTM3U\n',
      'https://cdn.example/m.m3u8'
    )!;
    expect(payload.hlsSource.map((s) => s.label)).toEqual(['Only']);
  });

  it('buckets quality labels from resolution', () => {
    expect(bucketQualityLabel(1280, 534)).toBe('720');
    expect(bucketQualityLabel(640, 266)).toBe('360');
    expect(bucketQualityLabel(1920, 800)).toBe('1080');
    expect(bucketQualityLabel(854, 480)).toBe('480');
    expect(bucketQualityLabel(320, 180)).toBe('180');
  });

  it('parses master playlist skipping failover', () => {
    const { audioTracks, variants } = parseMasterPlaylist(MASTER, 'https://cdn.example/master.m3u8');
    expect(audioTracks).toHaveLength(6);
    expect(audioTracks.every((t) => !/failover/i.test(t.groupId))).toBe(true);
    expect(variants).toHaveLength(2);
    expect(variants[0].width).toBe(1280);
  });

  it('matches audio playlist by NAME suffix index', () => {
    const { audioTracks } = parseMasterPlaylist(MASTER, 'https://cdn.example/master.m3u8');
    expect(matchAudioPlaylistUri(audioTracks, 0)).toContain('/a1.m3u8');
    expect(matchAudioPlaylistUri(audioTracks, 3)).toContain('/a4.m3u8');
    expect(matchAudioPlaylistUri([], 0)).toBeUndefined();
    expect(
      matchAudioPlaylistUri([{ name: 'nosuffix', uri: 'https://cdn/x', groupId: 'audio0' }], 0)
    ).toBe('https://cdn/x');
    expect(
      matchAudioPlaylistUri(
        [{ name: 'Audio', uri: 'https://cdn/file.mp4/index-a7.m3u8', groupId: 'audio0' }],
        6
      )
    ).toContain('index-a7');
  });

  it('builds StreamPayload filtering delete and mapping audioId', () => {
    const source = parseEmbessSource(EMBESS_HTML)!;
    const payload = buildEmbessStreamPayload(source, MASTER, source.hls);
    expect(payload).not.toBeNull();
    expect(payload!.hlsSource.map((s) => s.label)).toEqual([
      'MovieDalen',
      'TVShows',
      'LostFilm',
      'Postmodern',
      'Eng.Original',
    ]);
    expect(payload!.hlsSource.every((s) => s.audioId)).toBe(true);
    expect(payload!.hlsSource[0].quality['720']).toBe(source.hls);
    expect(payload!.hlsSource[0].quality['360']).toBe(source.hls);
    expect(payload!.tracks).toHaveLength(2);
  });

  it('adds placeholder subtitle track when cc empty', () => {
    const source = parseEmbessSource(EMBESS_HTML)!;
    source.cc = [];
    const payload = buildEmbessStreamPayload(source, MASTER, source.hls)!;
    expect(payload.tracks).toHaveLength(1);
    expect(payload.tracks[0].src).toBe('');
  });

  it('parses fsst progressive quality URLs', () => {
    const html = `
      ,[720p]https://cdn/get_file/720.mp4/,[1080p]https://cdn/get_file/1080.mp4/
      https://cdn/other_360p.mp4
    `;
    const src = parseFsstProgressiveSources(html);
    expect(src).not.toBeNull();
    expect(src!.quality['720']).toContain('720.mp4');
    expect(src!.quality['1080']).toContain('1080.mp4');
    expect(src!.quality['360']).toContain('360p.mp4');
  });

  it('returns null for empty fsst html', () => {
    expect(parseFsstProgressiveSources('<html></html>')).toBeNull();
  });

  it('falls back to master audio names when embess names empty', () => {
    const payload = buildEmbessStreamPayload(
      { hls: 'https://cdn.example/master.m3u8', audio: { names: [], order: [] }, cc: [] },
      MASTER,
      'https://cdn.example/master.m3u8'
    )!;
    expect(payload.hlsSource[0].label).toBe('rus0');
    expect(payload.tracks[0].src).toBe('');
  });

  it('builds default source when master has no audio tracks', () => {
    const payload = buildEmbessStreamPayload(
      { hls: 'https://cdn.example/m.m3u8', audio: { names: [], order: [] }, cc: [] },
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\nhttps://cdn.example/v.m3u8\n',
      'https://cdn.example/m.m3u8'
    )!;
    expect(payload.hlsSource[0].label).toBe('Default');
    expect(payload.hlsSource[0].quality['720']).toBeTruthy();
  });

  it('defaults quality map to 720 when master has no variants', () => {
    const payload = buildEmbessStreamPayload(
      { hls: 'https://cdn.example/m.m3u8', audio: { names: ['A'], order: [0] }, cc: [] },
      '#EXTM3U\n',
      'https://cdn.example/m.m3u8'
    )!;
    expect(payload.hlsSource[0].quality).toEqual({ '720': 'https://cdn.example/m.m3u8' });
  });
});

describe('resolveEmbedStream network', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves embess HTML + master into payload', async () => {
    global.fetch = jest.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('embess')) {
        return {
          ok: true,
          text: async () => EMBESS_HTML,
        } as Response;
      }
      return {
        ok: true,
        text: async () => MASTER,
      } as Response;
    }) as typeof fetch;

    const payload = await resolveEmbedStream('https://api.embess.ws/embed/movie/1');
    expect(payload?.hlsSource[0].label).toBe('MovieDalen');
    expect(payload?.tracks.length).toBeGreaterThan(0);
  });

  it('resolves a VenomPlayer playlist episode by season/episode', async () => {
    const playlistHtml = `
      makePlayer({
        playlist: {
          seasons: [{
            "season": 1,
            "episodes": [
              { "episode": "1", "hls": "https://cdn.example/e1/master.m3u8", "audio": { "names": ["A"] } },
              { "episode": "2", "hls": "https://cdn.example/e2/master.m3u8", "audio": { "names": ["Eng.Original"] } }
            ]
          }]
        }
      });
    `;
    global.fetch = jest.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('embess')) {
        return { ok: true, text: async () => playlistHtml } as Response;
      }
      if (u.includes('/e2/')) {
        return { ok: true, text: async () => MASTER } as Response;
      }
      return { ok: true, text: async () => '#EXTM3U\nnot-the-episode' } as Response;
    }) as typeof fetch;

    const payload = await resolveEmbessStream('https://api.embess.ws/embed/movie/76587', {
      season: 1,
      episode: 2,
    });
    expect(payload?.hlsSource[0].label).toBe('Eng.Original');
    expect(payload?.hlsSource[0].season).toBe(1);
    expect(payload?.hlsSource[0].episode).toBe(2);
    expect(String((global.fetch as jest.Mock).mock.calls[1][0])).toContain('/e2/');
  });

  it('falls through to source.hls when playlist master is not m3u8', async () => {
    const html = `
      makePlayer({
        playlist: {
          seasons: [{
            "season": 1,
            "episodes": [
              { "episode": "1", "hls": "https://cdn.example/bad/master.m3u8", "audio": { "names": ["A"] } }
            ]
          }]
        },
        source: {
          hls: "https://cdn.example/good/master.m3u8",
          audio: { names: ["Fallback"] }
        }
      });
    `;
    global.fetch = jest.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('embess')) {
        return { ok: true, text: async () => html } as Response;
      }
      if (u.includes('/bad/')) {
        return { ok: true, text: async () => 'not a playlist' } as Response;
      }
      return { ok: true, text: async () => MASTER } as Response;
    }) as typeof fetch;

    const payload = await resolveEmbessStream('https://api.embess.ws/embed/movie/76587', {
      season: 1,
      episode: 1,
    });
    expect(payload?.hlsSource[0].label).toBe('Fallback');
  });

  it('returns null when embess HTML has no makePlayer', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => '<html></html>',
    })) as unknown as typeof fetch;

    await expect(resolveEmbessStream('https://api.embess.ws/x')).resolves.toBeNull();
  });

  it('resolves fsst progressive embed', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => `,[720p]https://cdn/x_720.mp4/`,
    })) as unknown as typeof fetch;

    const payload = await resolveFsstStream('https://fsst.online/embed/1');
    expect(payload?.hlsSource[0].quality['720']).toContain('720.mp4');
    expect(payload?.progressive).toBe(true);
  });

  it('resolves fsst playlist_iframe episodes', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => `
        var player = new Playerjs({
          file:
[{"comment": "Кухня 2-1","file":"[720p]https://cdn/e1_720.mp4,[360p]https://cdn/e1_360.mp4"},{"comment": "Кухня 2 - 12","file":"[720p]https://cdn/e12_720.mp4"}]
        });
      `,
    })) as unknown as typeof fetch;

    const payload = await resolveFsstStream('https://fsst.online/playlist_iframe/17980/');
    expect(payload?.progressive).toBe(true);
    expect(payload?.hlsSource).toHaveLength(2);
    expect(payload?.hlsSource[0]).toMatchObject({
      label: 'Кухня 2-1',
      season: 2,
      episode: 1,
    });
    expect(payload?.hlsSource[0].quality['720']).toContain('e1_720.mp4');
    expect(payload?.hlsSource[1]).toMatchObject({ season: 2, episode: 12 });
  });

  it('parses playlist entries with escaped quotes in comments', () => {
    const eps = parseFsstPlaylistEpisodes(`
      file: [{"comment": "Ep \\"A\\"","file":"[720p]https://cdn/a.mp4"}]
    `);
    expect(eps).toHaveLength(1);
    expect(eps[0].label).toContain('A');
  });

  it('tolerates nested arrays inside playlist entries', () => {
    const eps = parseFsstPlaylistEpisodes(
      'file: [{"comment":"A","file":"[720p]https://cdn/a.mp4","poster":[1,2]}]'
    );
    expect(eps).toHaveLength(1);
    expect(eps[0].quality['720']).toContain('a.mp4');
  });

  it('skips playlist edges: no array, unclosed, empty quality, empty episodes', async () => {
    expect(parseFsstPlaylistEpisodes('file: not-an-array')).toEqual([]);
    expect(parseFsstPlaylistEpisodes('file: [{"comment":"A","file":"[720p]https://cdn/a.mp4"')).toEqual(
      []
    );
    expect(
      parseFsstPlaylistEpisodes('file: [{"comment":"","file":"[720p]https://cdn/a.mp4"}]')
    ).toEqual([]);
    expect(parseFsstPlaylistEpisodes('file: [{"comment":"Solo","file":"nope"}]')).toEqual([]);

    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => '<html>no playlist</html>',
    })) as unknown as typeof fetch;
    await expect(resolveFsstStream('https://fsst.online/playlist_iframe/1/')).resolves.toBeNull();
  });

  it('times out hung OkHttp embed fetch', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      () => new Promise(() => {})
    ) as unknown as typeof fetch;

    const pending = resolveEmbessStream('https://api.embess.ws/embed/1');
    await jest.advanceTimersByTimeAsync(13000);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('falls back to WebView HTML fetch when OkHttp times out', async () => {
    const { isWebViewHtmlFetcherReady, fetchHtmlViaWebView } = jest.requireMock(
      '@/src/shared/lib/webviewHtmlFetch'
    ) as {
      isWebViewHtmlFetcherReady: jest.Mock;
      fetchHtmlViaWebView: jest.Mock;
    };
    isWebViewHtmlFetcherReady.mockReturnValue(true);
    fetchHtmlViaWebView.mockResolvedValue(`
      file: [{"comment":"Кухня 2-1","file":"[360p]https://cdn/e1.mp4"}]
    `);
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const payload = await resolveFsstStream('https://fsst.online/playlist_iframe/1/');
    expect(fetchHtmlViaWebView).toHaveBeenCalledWith(
      'https://fsst.online/playlist_iframe/1/',
      expect.any(String),
      expect.objectContaining({ playerUrl: 'https://fsst.online/playlist_iframe/1/' })
    );
    expect(payload?.progressive).toBe(true);
    expect(payload?.hlsSource).toHaveLength(1);
    isWebViewHtmlFetcherReady.mockReturnValue(false);
  });

  it('prefers WebView for fsst/incvideo before OkHttp', async () => {
    const { isWebViewHtmlFetcherReady, fetchHtmlViaWebView } = jest.requireMock(
      '@/src/shared/lib/webviewHtmlFetch'
    ) as {
      isWebViewHtmlFetcherReady: jest.Mock;
      fetchHtmlViaWebView: jest.Mock;
    };
    isWebViewHtmlFetcherReady.mockReturnValue(true);
    fetchHtmlViaWebView.mockResolvedValue(`
      file: [{"comment":"Кухня 2-3","file":"[360p]https://cdn/e3.mp4"}]
    `);
    const fetchMock = jest.fn() as unknown as typeof fetch;
    global.fetch = fetchMock;

    const payload = await resolveFsstStream('https://fsst.online/playlist_iframe/3/');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload?.hlsSource?.[0]?.label).toBe('Кухня 2-3');
    isWebViewHtmlFetcherReady.mockReturnValue(false);
  });

  it('canonicalizes fsst.online HTML fetch URLs to incvideo1.online', () => {
    expect(canonicalizeEmbedFetchUrl('https://fsst.online/playlist_iframe/18805/')).toBe(
      'https://incvideo1.online/playlist_iframe/18805/'
    );
    expect(canonicalizeEmbedFetchUrl('https://www.fsst.online/x')).toBe(
      'https://incvideo1.online/x'
    );
    expect(canonicalizeEmbedFetchUrl('https://incvideo1.online/x')).toBe(
      'https://incvideo1.online/x'
    );
    // Invalid absolute URL → catch branch (no scheme → replace no-op).
    expect(canonicalizeEmbedFetchUrl('fsst.online/x')).toBe('fsst.online/x');
  });

  it('falls back to OkHttp when preferred WebView fetch fails', async () => {
    const { isWebViewHtmlFetcherReady, fetchHtmlViaWebView } = jest.requireMock(
      '@/src/shared/lib/webviewHtmlFetch'
    ) as {
      isWebViewHtmlFetcherReady: jest.Mock;
      fetchHtmlViaWebView: jest.Mock;
    };
    isWebViewHtmlFetcherReady.mockReturnValue(true);
    fetchHtmlViaWebView.mockRejectedValueOnce(new Error('wv fail'));
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () =>
        `file: [{"comment":"Кухня 2-9","file":"[360p]https://cdn/e9.mp4"}]`,
    })) as unknown as typeof fetch;

    const payload = await resolveFsstStream('https://fsst.online/playlist_iframe/9/');
    expect(payload?.hlsSource?.[0]?.label).toBe('Кухня 2-9');
    expect(global.fetch).toHaveBeenCalled();
    isWebViewHtmlFetcherReady.mockReturnValue(false);
  });

  it('uses WebView after OkHttp fails for embess hosts', async () => {
    const { isWebViewHtmlFetcherReady, fetchHtmlViaWebView } = jest.requireMock(
      '@/src/shared/lib/webviewHtmlFetch'
    ) as {
      isWebViewHtmlFetcherReady: jest.Mock;
      fetchHtmlViaWebView: jest.Mock;
    };
    isWebViewHtmlFetcherReady.mockReturnValue(true);
    // preferWebView true for embess — first call is WebView for HTML
    fetchHtmlViaWebView
      .mockResolvedValueOnce(EMBESS_HTML)
      .mockResolvedValueOnce(MASTER);

    const payload = await resolveEmbessStream('https://api.embess.ws/embed/movie/1');
    expect(payload?.hlsSource?.length).toBeGreaterThan(0);
    expect(fetchHtmlViaWebView).toHaveBeenCalled();
    isWebViewHtmlFetcherReady.mockReturnValue(false);
  });

  it('returns null from resolveEmbedStream for unknown hosts', async () => {
    await expect(resolveEmbedStream('https://kodik.info/x')).resolves.toBeNull();
  });

  it('swallows embess network errors and returns null', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(resolveEmbedStream('https://api.embess.ws/x')).resolves.toBeNull();
  });

  it('returns null when fsst resolve throws', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('fsst down');
    }) as unknown as typeof fetch;

    await expect(resolveEmbedStream('https://fsst.online/embed/1')).resolves.toBeNull();
  });

  it('returns null when embess master is not m3u8', async () => {
    global.fetch = jest.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('embess')) {
        return { ok: true, text: async () => EMBESS_HTML } as Response;
      }
      return { ok: true, text: async () => 'not a playlist' } as Response;
    }) as typeof fetch;

    await expect(resolveEmbessStream('https://api.embess.ws/x')).resolves.toBeNull();
  });

  it('throws path when fetch returns non-OK', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    })) as unknown as typeof fetch;

    await expect(resolveEmbessStream('https://api.embess.ws/x')).resolves.toBeNull();
  });

  it('resolveEmbedStream continues when embess has no makePlayer', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => '<html></html>',
    })) as unknown as typeof fetch;

    await expect(resolveEmbedStream('https://api.embess.ws/x')).resolves.toBeNull();
  });

  it('resolveFsstStream returns null when no progressive urls', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => '<html>no video</html>',
    })) as unknown as typeof fetch;

    await expect(resolveFsstStream('https://fsst.online/embed/1')).resolves.toBeNull();
  });

  it('fsst alt urls skip qualities already in map', () => {
    const html = `,[720p]https://cdn/a_720.mp4/ https://cdn/other_720p.mp4`;
    const src = parseFsstProgressiveSources(html)!;
    expect(src.quality['720']).toContain('a_720.mp4');
  });
});
