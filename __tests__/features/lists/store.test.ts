jest.mock('@/src/features/lists/db', () => ({
  listLists: jest.fn(async () => []),
  listAllItems: jest.fn(async () => []),
  insertList: jest.fn(async () => undefined),
  renameListRow: jest.fn(async () => undefined),
  deleteListRow: jest.fn(async () => undefined),
  upsertListItem: jest.fn(async () => undefined),
  deleteListItemRow: jest.fn(async () => undefined),
}));

import {
  deleteListItemRow,
  deleteListRow,
  insertList,
  listAllItems,
  listLists,
  renameListRow,
  upsertListItem,
} from '@/src/features/lists/db';
import { useListsStore } from '@/src/features/lists/store';
import { BUILTIN_QUEUE_ID } from '@/src/features/lists/types';
import type { MovieSummary } from '@/src/data/catalog/types';

const movie: MovieSummary = {
  id: '7',
  slug: 'seven',
  title: 'Seven',
  href: '/7-seven.html',
};

const builtin = {
  id: BUILTIN_QUEUE_ID,
  name: 'queue',
  kind: 'builtin' as const,
  createdAt: 0,
  sortIndex: 0,
};

describe('lists store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useListsStore.setState({ lists: [], items: [], hydrated: false });
  });

  it('hydrates builtins and items', async () => {
    (listLists as jest.Mock).mockResolvedValue([builtin]);
    (listAllItems as jest.Mock).mockResolvedValue([
      { ...movie, listId: BUILTIN_QUEUE_ID, createdAt: 1 },
    ]);
    await useListsStore.getState().hydrate();
    expect(useListsStore.getState().lists).toHaveLength(1);
    expect(useListsStore.getState().itemsFor(BUILTIN_QUEUE_ID)).toHaveLength(1);
    expect(useListsStore.getState().isInList(BUILTIN_QUEUE_ID, '7')).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveLists: (v: unknown) => void = () => undefined;
    (listLists as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLists = resolve;
        })
    );
    (listAllItems as jest.Mock).mockResolvedValueOnce([]);
    (listLists as jest.Mock).mockResolvedValueOnce([{ ...builtin, id: 'after' }]);
    (listAllItems as jest.Mock).mockResolvedValueOnce([]);

    const hydratePromise = useListsStore.getState().hydrate();
    await useListsStore.getState().createList('x');
    resolveLists([builtin]);
    await hydratePromise;
    expect(useListsStore.getState().lists[0]?.id).toBe('after');
  });

  it('toggle is idempotent add then remove', async () => {
    const added = await useListsStore.getState().toggleItem('queue', movie);
    expect(added).toBe(true);
    expect(upsertListItem).toHaveBeenCalled();
    expect(useListsStore.getState().isInList('queue', '7')).toBe(true);

    const removed = await useListsStore.getState().toggleItem('queue', movie);
    expect(removed).toBe(false);
    expect(deleteListItemRow).toHaveBeenCalledWith('queue', '7');
  });

  it('addItem fills slug/href defaults and skips when already present', async () => {
    const bare: MovieSummary = { id: '9', title: 'Bare', slug: '', href: '' };
    await useListsStore.getState().addItem('queue', bare);
    expect(upsertListItem).toHaveBeenCalledWith(
      expect.objectContaining({ slug: '9', href: '/9.html' })
    );
    await useListsStore.getState().addItem('queue', bare);
    expect(upsertListItem).toHaveBeenCalledTimes(1);
  });

  it('replaces an item that appeared while upserting', async () => {
    (upsertListItem as jest.Mock).mockImplementation(async () => {
      useListsStore.setState({
        items: [{ ...movie, listId: 'queue', createdAt: 1 }],
        lists: [],
        hydrated: true,
      });
    });
    await useListsStore.getState().addItem('queue', movie);
    const items = useListsStore.getState().items.filter((i) => i.listId === 'queue' && i.id === '7');
    expect(items).toHaveLength(1);
  });

  it('guards in-flight double add', async () => {
    let resolveUpsert: () => void = () => undefined;
    (upsertListItem as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpsert = resolve;
        })
    );
    const first = useListsStore.getState().addItem('queue', movie);
    await useListsStore.getState().addItem('queue', movie);
    resolveUpsert();
    await first;
    expect(upsertListItem).toHaveBeenCalledTimes(1);
  });

  it('creates, renames, and deletes custom lists; ignores builtins', async () => {
    useListsStore.setState({ lists: [builtin], items: [], hydrated: true });
    const created = await useListsStore.getState().createList('  ');
    expect(created.name).toBe('List');
    expect(insertList).toHaveBeenCalled();

    const named = await useListsStore.getState().createList('  Mine  ');
    expect(named.name).toBe('Mine');

    await useListsStore.getState().renameList(BUILTIN_QUEUE_ID, 'nope');
    expect(renameListRow).not.toHaveBeenCalled();

    await useListsStore.getState().renameList(named.id, '   ');
    expect(renameListRow).not.toHaveBeenCalled();

    await useListsStore.getState().renameList('missing', 'X');
    expect(renameListRow).not.toHaveBeenCalled();

    await useListsStore.getState().renameList(named.id, '  New  ');
    expect(renameListRow).toHaveBeenCalledWith(named.id, 'New');
    expect(useListsStore.getState().lists.find((l) => l.id === named.id)?.name).toBe('New');

    useListsStore.setState({
      lists: [...useListsStore.getState().lists],
      items: [{ ...movie, listId: named.id, createdAt: 1 }],
      hydrated: true,
    });
    await useListsStore.getState().deleteList(BUILTIN_QUEUE_ID);
    expect(deleteListRow).not.toHaveBeenCalled();

    await useListsStore.getState().deleteList(named.id);
    expect(deleteListRow).toHaveBeenCalledWith(named.id);
    expect(useListsStore.getState().items).toEqual([]);
  });
});
