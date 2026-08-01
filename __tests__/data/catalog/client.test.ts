import { absolutize, fetchHtml, stripTags } from '@/src/data/catalog/client';
import { BASE_URL } from '@/src/data/catalog/types';

describe('absolutize', () => {
  it('returns undefined for empty', () => {
    expect(absolutize(null)).toBeUndefined();
    expect(absolutize(undefined)).toBeUndefined();
    expect(absolutize('')).toBeUndefined();
  });

  it('keeps absolute http(s)', () => {
    expect(absolutize('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(absolutize('http://cdn.example/a.jpg')).toBe('http://cdn.example/a.jpg');
  });

  it('expands protocol-relative and root-relative', () => {
    expect(absolutize('//cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(absolutize('/uploads/a.jpg')).toBe(`${BASE_URL}/uploads/a.jpg`);
    expect(absolutize('uploads/a.jpg')).toBe(`${BASE_URL}/uploads/a.jpg`);
  });

  it('rewrites newdeaf.site to BASE_URL', () => {
    expect(absolutize('https://newdeaf.site/img.jpg')).toBe(`${BASE_URL}/img.jpg`);
    expect(absolutize('http://www.newdeaf.site/img.jpg')).toBe(`${BASE_URL}/img.jpg`);
  });
});

describe('stripTags', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripTags('<b>Hello</b>  <i>World</i>')).toBe('Hello World');
  });

  it('turns br into newline then collapses', () => {
    expect(stripTags('a<br/>b')).toBe('a b');
  });

  it('decodes named and numeric entities', () => {
    expect(stripTags('A&nbsp;&amp;&quot;B&quot;&apos;&lt;&gt;')).toBe('A &"B"\'<>');
    expect(stripTags('&mdash;&ndash;&hellip;&laquo;&raquo;')).toBe('—–…«»');
    expect(stripTags('&ldquo;&rdquo;&lsquo;&rsquo;&#039;')).toBe('\u201C\u201D\u2018\u2019\'');
    expect(stripTags('&#x41;&#65;')).toBe('AA');
    expect(stripTags('&unknown;')).toBe('&unknown;');
  });
});

describe('fetchHtml', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockResponse(opts: {
    ok?: boolean;
    status?: number;
    bytes: number[];
    contentType?: string | null;
  }) {
    global.fetch = jest.fn(async () => ({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? (opts.contentType ?? null) : null,
      },
      arrayBuffer: async () => Uint8Array.from(opts.bytes).buffer,
    })) as unknown as typeof fetch;
  }

  it('prefixes BASE_URL for relative paths and decodes windows-1251 by default', async () => {
    // 0xC0 is А in windows-1251
    mockResponse({ bytes: [0xc0], contentType: null });
    const html = await fetchHtml('/movie.html');
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/movie.html`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          Referer: `${BASE_URL}/`,
        }),
      })
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it('uses absolute http urls as-is', async () => {
    mockResponse({ bytes: [0x41], contentType: 'text/html; charset=utf-8' });
    const html = await fetchHtml('https://example.com/x');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/x',
      expect.any(Object)
    );
    expect(html).toBe('A');
  });

  it('decodes utf-8 when charset declared', async () => {
    mockResponse({
      bytes: [0xd0, 0x90], // UTF-8 А
      contentType: 'text/html; charset="UTF-8"',
    });
    expect(await fetchHtml('/a')).toBe('А');
  });

  it('accepts utf8 alias without hyphen', async () => {
    mockResponse({
      bytes: [0x42],
      contentType: 'text/html;charset=utf8',
    });
    expect(await fetchHtml('/b')).toBe('B');
  });

  it('decodes windows-1251 when charset declared as cp1251 variants', async () => {
    mockResponse({ bytes: [0xc0], contentType: 'text/html; charset=cp1251' });
    const a = await fetchHtml('/c');
    mockResponse({ bytes: [0xc0], contentType: 'text/html; charset=windows-1251' });
    const b = await fetchHtml('/d');
    mockResponse({ bytes: [0xc0], contentType: 'text/html; charset=cp-1251' });
    const c = await fetchHtml('/e');
    mockResponse({ bytes: [0xc0], contentType: 'text/html; charset=win-1251' });
    const d = await fetchHtml('/f');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(c).toBe(d);
  });

  it('uses utf-8 when BOM present and charset not windows-1251', async () => {
    mockResponse({
      bytes: [0xef, 0xbb, 0xbf, 0x43],
      contentType: 'text/html',
    });
    expect(await fetchHtml('/bom')).toBe('C');
  });

  it('ignores unknown charset and falls back to win1251 without BOM', async () => {
    mockResponse({
      bytes: [0x44],
      contentType: 'text/html; charset=iso-8859-1',
    });
    const html = await fetchHtml('/unk');
    expect(html).toBe('D');
  });

  it('throws on non-ok response', async () => {
    mockResponse({ ok: false, status: 503, bytes: [], contentType: null });
    await expect(fetchHtml('/fail')).rejects.toThrow(/HTTP 503/);
  });

  it('merges custom init headers', async () => {
    mockResponse({ bytes: [0x45], contentType: 'text/html; charset=utf-8' });
    await fetchHtml('/h', { headers: { 'X-Custom': '1' } });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom': '1',
          'User-Agent': expect.any(String),
        }),
      })
    );
  });

  it('handles charset header without value after equals', async () => {
    mockResponse({ bytes: [0x46], contentType: 'text/html; charset=' });
    // charsetFromContentType returns null → win1251 path (no BOM)
    expect(await fetchHtml('/empty-charset')).toBe('F');
  });
});
