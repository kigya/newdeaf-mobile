import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CatalogRails } from '@/src/screens/catalog/CatalogRails';
import { t } from '@/src/shared/i18n';

jest.mock('@/src/features/discovery/store', () => ({
  useDiscoveryStore: jest.fn((sel) =>
    sel({
      hydrated: true,
      refreshing: false,
      refreshStale: jest.fn(async () => undefined),
      rails: {},
      visibleItems: () => [],
      pickRandom: jest.fn(async () => undefined),
    })
  ),
}));

jest.mock('@/src/shared/ui/ContinueWatchingRail', () => ({
  ContinueWatchingRail: () => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return ReactLocal.createElement(Text, null, 'continue');
  },
}));

jest.mock('@/src/shared/ui/GenresBanner', () => ({
  GenresBanner: () => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return ReactLocal.createElement(Text, null, 'genres');
  },
}));

describe('CatalogRails', () => {
  it('renders with empty discovery rails without crashing', async () => {
    const onLucky = jest.fn();
    await render(<CatalogRails onRequestRemove={jest.fn()} onLucky={onLucky} />);
    expect(screen.getByText(t('catalog.lucky'))).toBeTruthy();
    expect(screen.getByText(t('catalog.newReleases'))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('catalog.lucky')));
    expect(onLucky).toHaveBeenCalled();
  });

  it('shows skeleton while hydrating and rails when items exist', async () => {
    const { useDiscoveryStore } = jest.requireMock('@/src/features/discovery/store') as {
      useDiscoveryStore: jest.Mock;
    };
    useDiscoveryStore.mockImplementation((sel: (s: Record<string, unknown>) => unknown) =>
      sel({
        hydrated: false,
        refreshing: true,
        refreshStale: jest.fn(async () => undefined),
        rails: {},
        visibleItems: () => [],
        pickRandom: jest.fn(async () => undefined),
      })
    );
    const first = await render(<CatalogRails onRequestRemove={jest.fn()} onLucky={jest.fn()} />);
    expect(screen.getByText(t('catalog.lucky'))).toBeTruthy();
    first.unmount();

    useDiscoveryStore.mockImplementation((sel: (s: Record<string, unknown>) => unknown) =>
      sel({
        hydrated: true,
        refreshing: false,
        refreshStale: jest.fn(async () => undefined),
        rails: {
          'site-popular': {
            items: [
              { id: 'a', slug: 'a', title: 'Rail Film', href: '/a.html' },
              { id: 'b', slug: 'b', title: 'Rail Film 2', href: '/b.html' },
              { id: 'c', slug: 'c', title: 'Rail Film 3', href: '/c.html' },
            ],
          },
        },
        visibleItems: () => [],
        pickRandom: jest.fn(async () => undefined),
      })
    );
    await render(<CatalogRails onRequestRemove={jest.fn()} onLucky={jest.fn()} />);
    expect(screen.getAllByText('Rail Film').length).toBeGreaterThan(0);
  });
});
