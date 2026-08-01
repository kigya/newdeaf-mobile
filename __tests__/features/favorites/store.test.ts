jest.mock('@/src/features/favorites/db', () => ({
  listFavorites: jest.fn(async () => []),
  upsertFavorite: jest.fn(async () => undefined),
  deleteFavoriteRow: jest.fn(async () => undefined),
}));

import { deleteFavoriteRow, listFavorites, upsertFavorite } from '@/src/features/favorites/db';
import { useFavoritesStore } from '@/src/features/favorites/store';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie: MovieSummary = {
  id: '7',
  slug: 'seven',
  title: 'Seven',
  href: '/7-seven.html',
};

describe('favorites store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFavoritesStore.setState({ items: [], hydrated: false });
  });

  it('hydrates from db', async () => {
    (listFavorites as jest.Mock).mockResolvedValue([
      { ...movie, createdAt: 1 },
    ]);
    await useFavoritesStore.getState().hydrate();
    expect(useFavoritesStore.getState().items).toHaveLength(1);
    expect(useFavoritesStore.getState().hydrated).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveList: (v: unknown) => void = () => undefined;
    (listFavorites as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    (listFavorites as jest.Mock).mockResolvedValueOnce([{ ...movie, id: 'after', createdAt: 2 }]);

    const hydratePromise = useFavoritesStore.getState().hydrate();
    await useFavoritesStore.getState().remove('x');
    resolveList([{ ...movie, createdAt: 1 }]);
    await hydratePromise;
    expect(useFavoritesStore.getState().items[0]?.id).toBe('after');
  });

  it('toggles add then remove', async () => {
    const added = await useFavoritesStore.getState().toggle(movie);
    expect(added).toBe(true);
    expect(upsertFavorite).toHaveBeenCalled();
    expect(useFavoritesStore.getState().isFavorite('7')).toBe(true);

    const removed = await useFavoritesStore.getState().toggle(movie);
    expect(removed).toBe(false);
    expect(deleteFavoriteRow).toHaveBeenCalledWith('7');
    expect(useFavoritesStore.getState().isFavorite('7')).toBe(false);
  });

  it('toggle fills defaults for missing slug/href', async () => {
    const bare: MovieSummary = { id: '9', title: 'Bare', slug: '', href: '' };
    await useFavoritesStore.getState().toggle(bare);
    expect(upsertFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '9',
        slug: '9',
        href: '/9.html',
      })
    );
  });

  it('toggle add filters existing items by id', async () => {
    useFavoritesStore.setState({
      items: [{ ...movie, id: 'other', createdAt: 1 }],
      hydrated: true,
    });
    await useFavoritesStore.getState().toggle({ ...movie, id: 'new' });
    expect(useFavoritesStore.getState().items.map((i) => i.id)).toEqual(['new', 'other']);
  });

  it('guards double-tap in-flight', async () => {
    let resolveUpsert: () => void = () => undefined;
    (upsertFavorite as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpsert = resolve;
        })
    );

    const first = useFavoritesStore.getState().toggle(movie);
    const second = await useFavoritesStore.getState().toggle(movie);
    // Second call while in-flight returns current favorite state (false — not yet added)
    expect(second).toBe(false);
    resolveUpsert();
    await first;
    expect(useFavoritesStore.getState().isFavorite('7')).toBe(true);
  });

  it('remove deletes row', async () => {
    useFavoritesStore.setState({
      items: [{ ...movie, createdAt: 1 }],
      hydrated: true,
    });
    await useFavoritesStore.getState().remove('7');
    expect(deleteFavoriteRow).toHaveBeenCalledWith('7');
    expect(useFavoritesStore.getState().items).toEqual([]);
  });
});
