import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import type { MovieSummary } from '@/src/data/catalog/types';
import { MovieRail } from '@/src/shared/ui/MovieRail';

function movies(n: number): MovieSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    slug: `m${i}`,
    title: `Film ${i}`,
    href: `/m${i}.html`,
    posterUrl: i === 0 ? undefined : `https://p/${i}.jpg`,
  }));
}

describe('MovieRail', () => {
  it('hides when fewer than 3 items', async () => {
    await render(<MovieRail title="Rail" items={movies(2)} testID="rail" />);
    expect(screen.queryByTestId('rail')).toBeNull();
  });

  it('renders 3+ items and navigates on press', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
    await render(<MovieRail title="Rail" items={movies(3)} testID="rail" />);
    expect(screen.getByTestId('rail')).toBeTruthy();
    expect(screen.getByText('Film 0')).toBeTruthy();
    expect(screen.getByText('Film 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Film 0'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/movie/[id]',
        params: expect.objectContaining({ id: 'm0' }),
      })
    );
  });
});
