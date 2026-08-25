import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LibraryStats } from '@/src/screens/favorites/LibraryStats';
import { t } from '@/src/shared/i18n';

const stats = {
  hoursWatched: 3.4,
  completedCount: 2,
  favoritesCount: 5,
  downloadsBytes: 2048,
};

describe('LibraryStats', () => {
  it('renders KPI values and routes taps', async () => {
    const onOpenHistory = jest.fn();
    const onOpenFavorites = jest.fn();
    const onOpenDownloads = jest.fn();
    await render(
      <LibraryStats
        stats={stats}
        onOpenHistory={onOpenHistory}
        onOpenFavorites={onOpenFavorites}
        onOpenDownloads={onOpenDownloads}
      />
    );
    expect(screen.getByTestId('library-stats')).toBeTruthy();
    expect(screen.getByText(t('favorites.statHours'))).toBeTruthy();
    expect(screen.getByText(t('favorites.statFinished'))).toBeTruthy();
    expect(screen.getByText(t('favorites.statSaved'))).toBeTruthy();
    expect(screen.getByText(t('favorites.statOffline'))).toBeTruthy();
    expect(screen.getByText('3.4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('library-stat-hours'));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('library-stat-completed'));
    expect(onOpenHistory).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByTestId('library-stat-favorites'));
    expect(onOpenFavorites).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('library-stat-downloads'));
    expect(onOpenDownloads).toHaveBeenCalledTimes(1);
  });

  it('applies pressed tile style', async () => {
    const TestRenderer = require('react-test-renderer');
    const { act } = require('@testing-library/react-native');
    let renderer: {
      root: {
        findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => {
          props: { style: (s: { pressed: boolean }) => unknown };
        }[];
      };
      unmount: () => void;
    };
    await act(async () => {
      renderer = TestRenderer.create(
        <LibraryStats
          stats={stats}
          onOpenHistory={jest.fn()}
          onOpenFavorites={jest.fn()}
          onOpenDownloads={jest.fn()}
        />
      );
    });
    const pressable = renderer!.root.findAll(
      (n) => typeof n.props?.style === 'function' && typeof n.props?.onPress === 'function'
    )[0];
    expect(pressable.props.style({ pressed: true })).toBeTruthy();
    expect(pressable.props.style({ pressed: false })).toBeTruthy();
    await act(async () => {
      renderer!.unmount();
    });
  });
});
