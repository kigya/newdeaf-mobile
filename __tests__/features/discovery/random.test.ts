import {
  pickRandomCatalogMovie,
  pickRandomIndex,
  pickRandomItem,
  pickRandomPage,
} from '@/src/features/discovery/random';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie = (id: string): MovieSummary => ({
  id,
  slug: id,
  title: id,
  href: `/${id}.html`,
});

describe('discovery random', () => {
  afterEach(() => {
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('pickRandomPage / index / item handle empty and bounds', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickRandomPage(0)).toBe(1);
    expect(pickRandomPage(20)).toBe(1);
    expect(pickRandomIndex(0)).toBe(-1);
    expect(pickRandomIndex(4)).toBe(0);
    expect(pickRandomItem([])).toBeUndefined();
    expect(pickRandomItem(['a', 'b'])).toBe('a');

    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(pickRandomPage(20)).toBe(20);
    expect(pickRandomIndex(4)).toBe(3);
  });

  it('pickRandomCatalogMovie uses page 1 when empty, last, or random page 1', async () => {
    expect(
      await pickRandomCatalogMovie(async () => ({ items: [], hasMore: false }))
    ).toBeUndefined();

    const first = [movie('a'), movie('b')];
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(
      await pickRandomCatalogMovie(async () => ({ items: first, hasMore: false }))
    ).toEqual(movie('a'));

    expect(
      await pickRandomCatalogMovie(async () => ({ items: first, hasMore: true }))
    ).toEqual(movie('a'));
  });

  it('falls back to page 1 when a later page is empty or throws', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const first = [movie('a')];
    const fetchEmpty = jest.fn(async (page: number) =>
      page === 1 ? { items: first, hasMore: true } : { items: [], hasMore: false }
    );
    expect(await pickRandomCatalogMovie(fetchEmpty)).toEqual(movie('a'));

    const fetchThrow = jest.fn(async (page: number) => {
      if (page === 1) return { items: first, hasMore: true };
      throw new Error('down');
    });
    expect(await pickRandomCatalogMovie(fetchThrow)).toEqual(movie('a'));

    const later = [movie('z')];
    const fetchLater = jest.fn(async (page: number) =>
      page === 1 ? { items: first, hasMore: true } : { items: later, hasMore: false }
    );
    expect(await pickRandomCatalogMovie(fetchLater)).toEqual(movie('z'));
  });
});
