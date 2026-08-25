jest.mock('@/src/data/catalog/catalog', () => ({
  searchMovies: jest.fn(async () => []),
}));

import { searchMovies } from '@/src/data/catalog/catalog';
import {
  normalizeCatalogTitle,
  resolveInCatalog,
  scoreCatalogMatch,
  titleForCatalogSearch,
} from '@/src/data/catalog/resolveInCatalog';
import type { MovieSummary } from '@/src/data/catalog/types';

const search = searchMovies as jest.MockedFunction<typeof searchMovies>;

function hit(overrides: Partial<MovieSummary> = {}): MovieSummary {
  return {
    id: '1',
    slug: 'film',
    title: 'Long Enough Title',
    year: '2020',
    href: '/1-film.html',
    ...overrides,
  };
}

describe('catalog title helpers', () => {
  it('normalizes quotes/case and strips search badges', () => {
    expect(normalizeCatalogTitle('  «Foo»  "Bar"  ')).toBe('foo bar');
    expect(titleForCatalogSearch('Show Name — S01E02')).toBe('Show Name');
    expect(titleForCatalogSearch('Film (2020)')).toBe('Film');
    expect(titleForCatalogSearch('Serial 12')).toBe('Serial');
  });

  it('scores exact / includes / year proximity and rejects misses', () => {
    expect(
      scoreCatalogMatch({ nameRu: 'Inception', year: 2010 }, 'Inception', '2010')
    ).toBe(150);
    expect(
      scoreCatalogMatch({ nameEn: 'The Long Title', year: 2011 }, 'Long Title', '2010')
    ).toBe(55);
    expect(
      scoreCatalogMatch({ nameOriginal: 'Partial English Match' }, 'English Match')
    ).toBe(35);
    expect(scoreCatalogMatch({ nameRu: 'Unrelated' }, 'Something Else')).toBe(-1);
    expect(scoreCatalogMatch({ nameRu: 'Same', year: null }, 'Same', '2020')).toBe(100);
  });
});

describe('resolveInCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search.mockReset();
    search.mockResolvedValue([]);
  });

  it('skips short names, drops scores below 40, and respects limit', async () => {
    search.mockImplementation(async (q: string) => {
      if (q.includes('Exact Match Film')) {
        return [hit({ id: 'e', title: 'Exact Match Film', year: '2021' })];
      }
      if (q.includes('Weak English')) {
        return [hit({ id: 'w', title: 'zzzz', year: '1990' })];
      }
      return [];
    });

    const out = await resolveInCatalog(
      [
        { nameRu: 'ab' },
        { nameRu: 'Exact Match Film', year: 2021 },
        { nameEn: 'Weak English Title Here', year: 1990 },
        { nameOriginal: 'No Hits Title', year: 2018 },
      ],
      1
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('e');
    expect(out[0].relationLabel).toBeUndefined();
  });

  it('picks the best of the first 8 hits and dedupes ids', async () => {
    search.mockResolvedValue([
      hit({ id: 'same', title: 'Wrong Year Film', year: '1990' }),
      hit({ id: 'same', title: 'Better Year Film', year: '2020' }),
      hit({ id: 'other', title: 'Better Year Film', year: '2020' }),
    ]);

    const out = await resolveInCatalog(
      [
        { nameRu: 'Better Year Film', year: '2020', relationType: 'SEQUEL' },
        { nameRu: 'Better Year Film', year: 2020 },
      ],
      6
    );
    expect(out.map((m) => m.id)).toEqual(['same']);
    expect(out[0].relationLabel).toBe('SEQUEL');
  });

  it('catches search errors and uses nameOriginal / nameEn fallbacks', async () => {
    search.mockImplementation(async (q: string) => {
      if (q.includes('Throws')) throw new Error('search down');
      if (q.includes('English Only Name')) {
        return [hit({ id: 'en', title: 'English Only Name', year: '2011' })];
      }
      return [];
    });

    const out = await resolveInCatalog(
      [
        { nameRu: 'Throws Long Title Here', year: 2021 },
        { nameEn: 'English Only Name', year: 2011 },
      ],
      4
    );
    expect(out.map((m) => m.id)).toEqual(['en']);
  });
});
