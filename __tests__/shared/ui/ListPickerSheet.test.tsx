import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { MovieSummary } from '@/src/data/catalog/types';
import { ListPickerSheet } from '@/src/shared/ui/ListPickerSheet';
import { t } from '@/src/shared/i18n';

const movie: MovieSummary = {
  id: '7',
  slug: 'seven',
  title: 'Seven',
  href: '/7.html',
};

const mockToggle = jest.fn(async () => true);
const mockCreate = jest.fn(async (name: string) => ({
  id: 'c1',
  name,
  kind: 'custom' as const,
  createdAt: 1,
  sortIndex: 2,
}));
const mockIsInList = jest.fn((_listId: string, _movieId: string) => false);

jest.mock('@/src/features/lists/store', () => ({
  useListsStore: jest.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      lists: [
        { id: 'queue', name: 'queue', kind: 'builtin', createdAt: 0, sortIndex: 0 },
        { id: 'rewatch', name: 'rewatch', kind: 'builtin', createdAt: 0, sortIndex: 1 },
        { id: 'legacy', name: 'legacy', kind: 'builtin', createdAt: 0, sortIndex: 1.5 },
        { id: 'c0', name: 'Mine', kind: 'custom', createdAt: 1, sortIndex: 2 },
      ],
      isInList: mockIsInList,
      toggleItem: mockToggle,
      createList: mockCreate,
    })
  ),
}));

describe('ListPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInList.mockReturnValue(false);
  });

  it('renders nothing when hidden or movie is missing', async () => {
    const { toJSON, rerender } = await render(
      <ListPickerSheet visible={false} movie={movie} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
    rerender(<ListPickerSheet visible movie={null} onClose={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('toggles a list and creates a custom list', async () => {
    const onClose = jest.fn();
    await render(<ListPickerSheet visible movie={movie} onClose={onClose} />);
    expect(screen.getAllByText(t('lists.add')).length).toBeGreaterThan(0);
    expect(screen.getByText(t('favorites.queue'))).toBeTruthy();
    expect(screen.getByText('legacy')).toBeTruthy();
    expect(screen.getByText('Mine')).toBeTruthy();

    await fireEvent.press(screen.getByText(t('favorites.queue')));
    expect(mockToggle).toHaveBeenCalledWith('queue', movie);

    mockIsInList.mockImplementation((listId: string) => listId === 'c0');
    await fireEvent.press(screen.getByText('Mine'));
    expect(mockToggle).toHaveBeenCalledWith('c0', movie);

    await fireEvent.changeText(screen.getByPlaceholderText(t('favorites.listName')), '  New  ');
    await fireEvent.press(screen.getByText(t('lists.create')));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('New'));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith('c1', movie));
  });

  it('ignores empty create names', async () => {
    await render(<ListPickerSheet visible movie={movie} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText(t('lists.create')));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
