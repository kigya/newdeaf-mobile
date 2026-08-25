const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

jest.mock('@/src/data/catalog/resolveInCatalog', () => ({
  resolveInCatalog: jest.fn(async () => []),
}));

import { resolveInCatalog } from '@/src/data/catalog/resolveInCatalog';
import { fetchKinopoiskExtras } from '@/src/data/catalog/kinopoisk/extras';

const mockResolveInCatalog = resolveInCatalog as jest.MockedFunction<typeof resolveInCatalog>;

const ORIGINAL = process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe('fetchKinopoiskExtras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockResolveInCatalog.mockReset();
    mockResolveInCatalog.mockResolvedValue([]);
    process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = 'kp-key';
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    else process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = ORIGINAL;
  });

  it('returns null when unconfigured or the id cannot be resolved', async () => {
    delete process.env.EXPO_PUBLIC_KINOPOISK_API_KEY;
    expect(await fetchKinopoiskExtras({ title: 'Film' })).toBeNull();

    process.env.EXPO_PUBLIC_KINOPOISK_API_KEY = 'kp-key';
    fetchMock.mockResolvedValue(ok({ films: [] }));
    expect(await fetchKinopoiskExtras({ title: 'No Match Title Unique' })).toBeNull();
  });

  it('maps stills, videos, reviews, seasons, sequels and caches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images?type=STILL')) {
        return ok({
          items: [
            { previewUrl: 'https://p/prev.jpg' },
            { imageUrl: 'https://p/1.jpg', previewUrl: 'https://p/1p.jpg' },
            ...Array.from({ length: 12 }, (_, i) => ({
              imageUrl: `https://p/s${i}.jpg`,
            })),
          ],
        });
      }
      if (u.includes('/images?type=WALLPAPER')) {
        return ok({ items: [{ imageUrl: 'https://p/wall.jpg' }] });
      }
      if (u.includes('/videos')) {
        return ok({
          items: [
            { url: '  ', name: 'Empty' },
            { url: 'https://vimeo.com/1', site: 'VIMEO', name: 'Vimeo' },
            {
              url: 'https://www.youtube.com/watch?v=abc123XYZ',
              site: 'YOUTUBE',
              name: 'Official',
            },
            { url: 'https://youtu.be/def456UVW', site: '', name: '  ' },
            { url: 'https://example.com/embed/ghi789RST', site: 'YOUTUBE' },
            {
              url: 'https://www.youtube.com/embed/jkl000AAA',
              site: 'YOUTUBE',
              name: 'Fourth',
            },
            {
              url: 'https://www.youtube.com/watch?v=skipMe',
              site: 'YOUTUBE',
              name: 'Fifth',
            },
          ],
        });
      }
      if (u.includes('/reviews')) {
        return ok({
          items: [
            { reviewId: 1, type: 'POSITIVE', title: 'T', author: 'Ann', description: '' },
            {
              kinopoiskId: 9,
              type: 'NEGATIVE',
              title: '  Bad  ',
              author: 'Bob',
              description: '<b>Harsh</b> words',
            },
            {
              reviewId: 3,
              description: 'Second',
            },
            { reviewId: 4, description: 'Third' },
            { reviewId: 5, description: 'Fourth skipped' },
          ],
        });
      }
      if (u.includes('/seasons')) {
        return ok({
          items: [
            { number: 0, episodes: [1] },
            { number: 1, episodes: [1, 2] },
            { number: 2 },
          ],
        });
      }
      if (u.includes('/sequels_and_prequels')) {
        return ok([
          { nameRu: 'ab' },
          {
            nameRu: 'Sequel Movie Title',
            year: 2021,
            relationType: 'SEQUEL',
            posterUrl: 'https://p/s.jpg',
          },
        ]);
      }
      if (u.match(/\/films\/77$/)) {
        return ok({
          slogan: '  Dream  ',
          ratingAgeLimits: 'age16',
          filmLength: 148,
          countries: [{ country: 'USA' }, { country: '  ' }, {}],
        });
      }
      return ok({ items: [] });
    });

    mockResolveInCatalog.mockResolvedValue([
      {
        id: 'seq',
        title: 'Sequel Movie Title',
        year: '2021',
        href: '/seq.html',
        slug: 'seq',
      },
    ]);

    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 77,
      title: 'Host',
      isSeries: true,
    });
    expect(extras?.kinopoiskId).toBe(77);
    expect(extras?.slogan).toBe('Dream');
    expect(extras?.ageRating).toBe('16+');
    expect(extras?.filmLengthMin).toBe(148);
    expect(extras?.countries).toEqual(['USA']);
    expect(extras?.images).toHaveLength(12);
    expect(extras?.images[0].previewUrl).toBe('https://p/1p.jpg');
    expect(extras?.youtubeVideos).toHaveLength(4);
    expect(extras?.youtubeVideos[0].youtubeId).toBe('abc123XYZ');
    expect(extras?.youtubeVideos[1].name).toBe('Trailer');
    expect(extras?.youtubeVideos[1].youtubeId).toBe('def456UVW');
    expect(extras?.reviews).toHaveLength(3);
    expect(extras?.reviews[0].description).toContain('Harsh');
    expect(extras?.reviews[0].author).toBe('Bob');
    expect(extras?.seasons).toEqual([
      { season: 1, episodes: 2 },
      { season: 2, episodes: 0 },
    ]);
    expect(extras?.sequels[0].id).toBe('seq');

    fetchMock.mockClear();
    const cached = await fetchKinopoiskExtras({ kinopoiskId: 77, title: 'Host' });
    expect(cached?.slogan).toBe('Dream');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to wallpapers, reviews[], sequels.items, and soft-fails sections', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images?type=STILL')) return ok({ items: [] });
      if (u.includes('/images?type=WALLPAPER')) {
        return ok({ items: [{ imageUrl: 'https://p/wall.jpg' }] });
      }
      if (u.includes('/videos')) throw new Error('videos down');
      if (u.includes('/reviews')) {
        return ok({
          reviews: [
            {
              reviewId: 8,
              type: 'NEUTRAL',
              description: 'From reviews key',
              authorInfo: { name: 'Kim' },
            },
          ],
        });
      }
      if (u.includes('/sequels_and_prequels')) {
        return ok({
          items: [{ nameEn: 'Prequel Movie Title', year: 2019, relationType: 'PREQUEL' }],
        });
      }
      if (u.match(/\/films\/88$/)) {
        return ok({ slogan: '  ', ratingAgeLimits: '  ', filmLength: 0, countries: [] });
      }
      return ok({});
    });

    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 88,
      title: 'Soft',
      isSeries: false,
    });
    expect(extras?.images[0].imageUrl).toBe('https://p/wall.jpg');
    expect(extras?.youtubeVideos).toEqual([]);
    expect(extras?.reviews[0].author).toBe('Kim');
    expect(extras?.seasons).toEqual([]);
    expect(extras?.slogan).toBeUndefined();
    expect(extras?.filmLengthMin).toBeUndefined();
  });

  it('soft-fails remaining extras endpoints and skips unmatched youtube urls', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.match(/\/films\/66$/)) throw new Error('detail');
      if (u.includes('/images?type=STILL')) throw new Error('stills');
      if (u.includes('/images?type=WALLPAPER')) throw new Error('walls');
      if (u.includes('/videos')) {
        return ok({
          items: [
            { url: 'https://youtube.com/watch?v=xx', site: 'YOUTUBE', name: 'Short id' },
            { url: 'https://example.com/watch', site: 'YOUTUBE', name: 'No id' },
          ],
        });
      }
      if (u.includes('/reviews')) throw new Error('reviews');
      if (u.includes('/seasons')) throw new Error('seasons');
      if (u.includes('/sequels_and_prequels')) throw new Error('sequels');
      return ok({});
    });
    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 66,
      title: 'Throws',
      isSeries: true,
    });
    expect(extras?.kinopoiskId).toBe(66);
    expect(extras?.images).toEqual([]);
    expect(extras?.youtubeVideos).toEqual([]);
    expect(extras?.reviews).toEqual([]);
    expect(extras?.seasons).toEqual([]);
    expect(extras?.sequels).toEqual([]);
    expect(extras?.countries).toEqual([]);
  });

  it('uses reviews without ids, empty image/season lists, and sequels.items fallback', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/images?type=STILL')) return ok({});
      if (u.includes('/images?type=WALLPAPER')) return ok({});
      if (u.includes('/videos')) return ok({ items: [{ url: 'https://www.youtube.com/embed/zzzzzzYYYY', site: '' }] });
      if (u.includes('/reviews')) {
        return ok({
          description: 'no',
          items: undefined,
          reviews: [{ description: 'Anonymous take' }],
        });
      }
      if (u.includes('/seasons')) return ok({});
      if (u.includes('/sequels_and_prequels')) return ok({});
      if (u.match(/\/films\/55$/)) return ok({});
      return ok({});
    });
    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 55,
      title: 'Sparse',
      isSeries: true,
    });
    expect(extras?.reviews[0].reviewId).toBe(0);
    expect(extras?.reviews[0].description).toBe('Anonymous take');
    expect(extras?.youtubeVideos[0].youtubeId).toBe('zzzzzzYYYY');
    expect(extras?.seasons).toEqual([]);
  });

  it('returns null when sequels payload crashes the mapper', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/sequels_and_prequels')) {
        return ok(null);
      }
      if (String(url).match(/\/films\/99$/)) return ok({});
      return ok({ items: [] });
    });
    expect(
      await fetchKinopoiskExtras({ kinopoiskId: 99, title: 'Crash' })
    ).toBeNull();
  });

  it('treats missing video and review lists as empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/videos')) return ok({});
      if (u.includes('/reviews')) return ok({});
      if (u.match(/\/films\/101$/)) return ok({});
      return ok({ items: [{ name: 'No url' }] });
    });
    const extras = await fetchKinopoiskExtras({
      kinopoiskId: 101,
      title: 'Empty lists',
      isSeries: false,
    });
    expect(extras?.youtubeVideos).toEqual([]);
    expect(extras?.reviews).toEqual([]);
  });
});
