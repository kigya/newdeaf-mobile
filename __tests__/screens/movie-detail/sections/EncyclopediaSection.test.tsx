import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { KinopoiskExtras } from '@/src/data/catalog/kinopoisk';
import type { TmdbExtras } from '@/src/data/catalog/tmdb';
import {
  EncyclopediaMeta,
  ReviewsSection,
} from '@/src/screens/movie-detail/sections/EncyclopediaSection';
import { t } from '@/src/shared/i18n';

const extras = (overrides: Partial<KinopoiskExtras> = {}): KinopoiskExtras => ({
  kinopoiskId: 1,
  countries: [],
  images: [],
  youtubeVideos: [],
  reviews: [],
  seasons: [],
  sequels: [],
  ...overrides,
});

describe('EncyclopediaSection', () => {
  it('returns null when extras are empty', async () => {
    const meta = await render(<EncyclopediaMeta extras={null} tmdb={null} />);
    expect(meta.toJSON()).toBeNull();
    const reviews = await render(<ReviewsSection extras={null} />);
    expect(reviews.toJSON()).toBeNull();
    const empty = await render(<EncyclopediaMeta extras={extras()} tmdb={null} />);
    expect(empty.toJSON()).toBeNull();
  });

  it('renders slogan, ratings, gallery, and seasons overlay', async () => {
    const tmdb: TmdbExtras = {
      tmdbId: 2,
      mediaType: 'movie',
      stills: ['https://t/1.jpg'],
      videos: [],
      cast: [],
    };
    await render(
      <EncyclopediaMeta
        extras={extras({
          slogan: 'Dreams',
          ageRating: '16+',
          filmLengthMin: 148,
          seasons: [{ season: 1, episodes: 8 }],
          images: [{ imageUrl: 'https://k/1.jpg', previewUrl: 'https://k/p.jpg' }],
        })}
        tmdb={tmdb}
        siteSeasonCount={2}
      />
    );
    expect(screen.getByText('Dreams')).toBeTruthy();
    expect(screen.getByText(t('movie.ageRating', { value: '16+' }))).toBeTruthy();
    expect(screen.getByText(t('movie.lengthMin', { n: 148 }))).toBeTruthy();
    expect(screen.getByText(t('movie.kpSeasonsOverlay', { kp: 1, site: 2 }))).toBeTruthy();
    expect(screen.getByText(t('movie.gallery'))).toBeTruthy();
  });

  it('formats Kinopoisk age18 tokens as 18+', async () => {
    await render(<EncyclopediaMeta extras={extras({ ageRating: 'age18' })} tmdb={null} />);
    expect(screen.getByText(t('movie.ageRating', { value: '18+' }))).toBeTruthy();
    expect(screen.queryByText(/age18/)).toBeNull();
  });

  it('renders slogan without a gallery when stills are missing', async () => {
    await render(<EncyclopediaMeta extras={extras({ slogan: 'Only slogan' })} tmdb={null} />);
    expect(screen.getByText('Only slogan')).toBeTruthy();
    expect(screen.queryByText(t('movie.gallery'))).toBeNull();
  });

  it('falls back to TMDB stills and gates review spoilers', async () => {
    const tmdb: TmdbExtras = {
      tmdbId: 2,
      mediaType: 'movie',
      stills: ['https://t/1.jpg'],
      videos: [],
      cast: [],
    };
    await render(<EncyclopediaMeta extras={extras()} tmdb={tmdb} />);
    expect(screen.getByText(t('movie.gallery'))).toBeTruthy();

    await render(
      <EncyclopediaMeta
        extras={extras({
          seasons: [{ season: 1, episodes: 8 }],
          images: [{ imageUrl: 'https://k/only.jpg' }],
        })}
        tmdb={null}
      />
    );
    expect(screen.queryByText(t('movie.kpSeasonsOverlay', { kp: 1, site: 2 }))).toBeNull();

    await render(
      <ReviewsSection
        extras={extras({
          reviews: [{ reviewId: 9, type: 'POSITIVE', description: 'Secret plot' }],
        })}
      />
    );
    expect(screen.getByText(t('movie.showReview'))).toBeTruthy();
    expect(screen.queryByText('Secret plot')).toBeNull();
    await fireEvent.press(screen.getByText(t('movie.showReview')));
    expect(screen.getByText('Secret plot')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('movie.hideReview')));
    expect(screen.queryByText('Secret plot')).toBeNull();
  });
});
