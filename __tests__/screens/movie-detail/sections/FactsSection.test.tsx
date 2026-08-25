import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FactsSection } from '@/src/screens/movie-detail/sections/FactsSection';
import { t } from '@/src/shared/i18n';

describe('FactsSection', () => {
  it('returns null without facts', async () => {
    const view = await render(<FactsSection facts={[]} />);
    expect(view.toJSON()).toBeNull();
  });

  it('shows non-spoiler facts and gates spoilers until tap', async () => {
    await render(
      <FactsSection
        facts={[
          { text: 'Safe fact', type: 'FACT', spoiler: false },
          { text: 'Secret ending', type: 'FACT', spoiler: true },
        ]}
      />
    );
    expect(screen.getByText('Safe fact')).toBeTruthy();
    expect(screen.queryByText('Secret ending')).toBeNull();
    await fireEvent.press(screen.getByTestId('fact-spoiler-1'));
    expect(screen.getByText('Secret ending')).toBeTruthy();
    expect(screen.getByText(t('movie.hideReview'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('fact-spoiler-1'));
    expect(screen.queryByText('Secret ending')).toBeNull();
  });
});
