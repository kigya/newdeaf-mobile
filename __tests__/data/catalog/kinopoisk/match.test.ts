import { scoreMatch, titleForSearch } from '@/src/data/catalog/kinopoisk/match';

describe('kinopoisk scoreMatch', () => {
  it('scores year off-by-one, series year window, and type bonuses', () => {
    expect(titleForSearch('Show Name — S01E02')).toBe('Show Name');

    const film = scoreMatch(
      { nameRu: 'Host Film', year: 2019, type: 'FILM' },
      'Host Film',
      '2020'
    );
    expect(film).toBe(130);

    const seriesFar = scoreMatch(
      { nameRu: 'Long Series', year: 2010, type: 'TV_SERIES' },
      'Long Series',
      '2020',
      true
    );
    expect(seriesFar).toBe(130);

    const mini = scoreMatch(
      { nameEn: 'Mini Show', year: 2020, type: 'MINI_SERIES' },
      'Mini Show',
      '2020',
      true
    );
    expect(mini).toBe(175);

    const tvShow = scoreMatch(
      { nameRu: 'Night Show', year: 2020, type: 'TV_SHOW' },
      'Night Show',
      undefined,
      true
    );
    expect(tvShow).toBe(125);

    expect(
      scoreMatch({ nameRu: 'Host Partial Extra', year: 2020 }, 'Host Partial')
    ).toBe(40);
    expect(
      scoreMatch({ nameEn: 'English Partial Extra', year: 2020 }, 'English Partial')
    ).toBe(35);

    expect(
      scoreMatch({ nameRu: 'Plain', year: 2020, type: 'FILM' }, 'Plain', undefined, false)
    ).toBe(110);

    expect(
      scoreMatch({ nameRu: 'Series Film', year: 2020, type: 'FILM' }, 'Series Film', '2020', true)
    ).toBe(150);
  });
});
