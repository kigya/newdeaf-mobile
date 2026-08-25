import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { RelatedRails } from '@/src/screens/movie-detail/sections/RelatedRails';
import { t } from '@/src/shared/i18n';

const related = {
  id: '2',
  slug: 'rel',
  title: 'Related',
  href: '/rel.html',
};

describe('RelatedRails', () => {
  it('renders similar, related, sequels and opens cards', async () => {
    const onOpen = jest.fn();
    await render(
      <RelatedRails
        similar={[{ ...related, id: 's', title: 'Similar Film', posterUrl: 'https://p' }]}
        related={[{ ...related, title: 'Related No Poster' }]}
        sequels={[
          { ...related, id: 'q', title: 'Sequel Film', posterUrl: 'https://q' },
          { ...related, id: 'q2', title: 'Sequel No Poster' },
        ]}
        onOpenMovie={onOpen}
      />
    );
    expect(screen.getByText(t('movie.similar'))).toBeTruthy();
    expect(screen.getByText(t('movie.related'))).toBeTruthy();
    expect(screen.getByText(t('movie.sequels'))).toBeTruthy();
    await fireEvent.press(screen.getByText('Similar Film'));
    await fireEvent.press(screen.getByText('Related No Poster'));
    await fireEvent.press(screen.getByText('Sequel Film'));
    await fireEvent.press(screen.getByText('Sequel No Poster'));
    expect(onOpen).toHaveBeenCalledTimes(4);
  });

  it('hides rails when lists are empty', async () => {
    await render(<RelatedRails onOpenMovie={jest.fn()} />);
    expect(screen.queryByText(t('movie.similar'))).toBeNull();
    expect(screen.queryByText(t('movie.related'))).toBeNull();
    expect(screen.queryByText(t('movie.sequels'))).toBeNull();
  });
});
