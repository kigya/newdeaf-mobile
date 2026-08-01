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
