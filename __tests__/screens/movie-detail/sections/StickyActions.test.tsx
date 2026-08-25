import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StickyActions } from '@/src/screens/movie-detail/sections/StickyActions';
import { t } from '@/src/shared/i18n';

describe('StickyActions', () => {
  it('hides add-to-list when the callback is omitted', async () => {
    await render(
      <StickyActions
        insetsBottom={0}
        downloadBlocked={false}
        streamLoading={false}
        activePlayerUrl="https://p"
        onWatchPress={jest.fn()}
        onDownloadPress={jest.fn()}
      />
    );
    expect(screen.getByText(t('common.watch'))).toBeTruthy();
    expect(screen.queryByTestId('movie-add-to-list')).toBeNull();
  });

  it('invokes add-to-list when provided', async () => {
    const onAddToList = jest.fn();
    await render(
      <StickyActions
        insetsBottom={0}
        downloadBlocked
        streamLoading={false}
        activePlayerUrl="https://p"
        onWatchPress={jest.fn()}
        onDownloadPress={jest.fn()}
        onAddToList={onAddToList}
      />
    );
    expect(screen.getByText(t('movie.downloadUnavailable'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('movie-add-to-list'));
    expect(onAddToList).toHaveBeenCalled();
  });
});
