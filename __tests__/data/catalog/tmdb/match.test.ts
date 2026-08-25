import { cacheKey, scoreMatch, yearFromDate } from '@/src/data/catalog/tmdb/match';

describe('tmdb match helpers', () => {
  it('scores exact, partial, original, and year proximity', () => {
    expect(
      scoreMatch({ id: 1, title: 'Inception', original_title: 'Inception' }, 'Inception', '2010')
    ).toBeGreaterThanOrEqual(100);

    expect(
      scoreMatch(
        { id: 2, name: 'Long Show Name Extra', original_name: 'Other' },
        'Long Show Name'
      )
    ).toBe(40);

    expect(
      scoreMatch(
        {
          id: 3,
          name: 'X',
          original_name: 'Unique Original Partial Match Title',
        },
        'Original Partial Match'
      )
    ).toBe(35);

    expect(
      scoreMatch(
        { id: 4, title: 'Exact Year Film', release_date: '2010-07-16' },
        'Exact Year Film',
        '2010'
      )
    ).toBe(150);

    expect(
      scoreMatch(
        { id: 5, title: 'Far Year Film', release_date: '2011-01-01' },
        'Far Year Film',
        '2010'
      )
    ).toBe(120);

    expect(
      scoreMatch({ id: 5, title: 'Nope', original_title: 'Also Nope' }, 'Zzzzy Unique Title')
    ).toBe(-1);

    expect(scoreMatch({ id: 6 }, 'Anything')).toBe(-1);
    expect(
      scoreMatch({ id: 7, name: 'Name Only Film', first_air_date: '2010-01-01' }, 'Name Only Film', '2010')
    ).toBe(150);
  });

  it('yearFromDate and cacheKey cover empty year', () => {
    expect(yearFromDate()).toBeUndefined();
    expect(yearFromDate('20')).toBeUndefined();
    expect(yearFromDate('2010-07-16')).toBe('2010');
    expect(cacheKey('Inception', undefined, 'en')).toBe('en|inception|');
    expect(cacheKey('Inception', '2010', 'ru')).toBe('ru|inception|2010');
  });
});
