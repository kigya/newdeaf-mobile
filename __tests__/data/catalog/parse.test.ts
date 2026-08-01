import {
  buildPlayerUrl,
  isNativeBalancerUrl,
  listEpisodes,
  listSeasons,
  parseCatalogPage,
  parseHasMorePages,
  parseMovieIdFromHref,
  parseMovieList,
  parsePlayerFileList,
  parseSearchResults,
  pickEpisodeEntry,
  primaryYear,
} from '@/src/data/catalog/parse';
import type { PlayerFileList } from '@/src/data/catalog/types';

describe('parseMovieIdFromHref', () => {
  it('parses slug html paths', () => {
    expect(parseMovieIdFromHref('/123-some-movie.html')).toEqual({
      id: '123',
      slug: 'some-movie',
      href: '/123-some-movie.html',
    });
  });

  it('parses newsid urls', () => {
    expect(parseMovieIdFromHref('/www/index.php?newsid=55')).toEqual({
      id: '55',
      slug: '55',
      href: '/www/index.php?newsid=55',
    });
  });

  it('returns null for unrelated hrefs', () => {
    expect(parseMovieIdFromHref('/about.html')).toBeNull();
  });
});

describe('primaryYear', () => {
  it('extracts first year', () => {
    expect(primaryYear('2019-2021')).toBe(2019);
    expect(primaryYear(undefined)).toBeUndefined();
    expect(primaryYear('n/a')).toBeUndefined();
  });
});

describe('parseMovieList / parseCatalogPage', () => {
  const card = (id: string, title: string) => `
    <div class="short-cols">
      <a class="short-img" href="/${id}-slug.html"><img src="/uploads/${id}.jpg" alt="${title}"/></a>
      <span class="short-title">${title}</span>
      <div class="short-rate-kp"><span>7.1</span></div>
    </div>`;

  it('parses short-cols cards and ignores duplicates', () => {
    const html = `${card('10', 'Film A (2020)')}${card('10', 'Film A again')}${card('11', 'Film B')}`;
    const items = parseMovieList(html);
    expect(items.map((i) => i.id)).toEqual(['10', '11']);
    expect(items[0].title).toContain('Film A');
    expect(items[0].kpRating).toBe('7.1');
  });

  it('hasMore from navigation or >=20 items', () => {
    const withNav = `${card('1', 'A')}<div class="navigation"><a href="/page/2/">2</a></div>`;
    expect(parseHasMorePages(withNav, 1)).toBe(true);
    expect(parseCatalogPage(withNav, 1).hasMore).toBe(true);
    expect(parseHasMorePages(card('1', 'A'), 1)).toBe(false);
  });
});

describe('parseSearchResults', () => {
  it('parses short-title links', () => {
    const html = `
      <a href="/42-movie.html"><span class="short-title">Search Hit (2021)</span></a>
      <img src="/uploads/x.jpg"/>
    `;
    const items = parseSearchResults(html);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('42');
  });
});

describe('player helpers', () => {
  it('detects native balancer urls', () => {
    expect(isNativeBalancerUrl('https://stloadi.live/embed/x')).toBe(true);
    expect(isNativeBalancerUrl('https://stravers.live/p')).toBe(true);
    expect(isNativeBalancerUrl('https://evil.com')).toBe(false);
  });

  it('buildPlayerUrl sets season/episode/time', () => {
    const url = buildPlayerUrl('https://player.example/embed?token=1', {
      season: 2,
      episode: 5,
      time: 90.7,
    });
    expect(url).toContain('season=2');
    expect(url).toContain('episode=5');
    expect(url).toContain('time=90');
  });

  it('returns base on invalid URL', () => {
    expect(buildPlayerUrl('not-a-url', { season: 1 })).toBe('not-a-url');
  });
});

describe('fileList / pickEpisodeEntry', () => {
  const fileList: PlayerFileList = {
    type: 'serial',
    all: {
      '1': {
        '1': {
          '10': {
            id: 1,
            translation: 'LostFilm',
            id_translation: 10,
            quality: '720',
            id_quality: 1,
          },
          '79': {
            id: 2,
            translation: 'Субтитры',
            id_translation: 79,
            quality: '720',
            id_quality: 1,
          },
        },
        '2': {
          '10': {
            id: 3,
            translation: 'LostFilm',
            id_translation: 10,
            quality: '720',
            id_quality: 1,
          },
        },
      },
    },
  };

  it('lists seasons and episodes sorted', () => {
    expect(listSeasons(fileList)).toEqual([1]);
    expect(listEpisodes(fileList, 1)).toEqual([1, 2]);
  });

  it('prefers preferred translation then subs id 79', () => {
    expect(pickEpisodeEntry(fileList, 1, 1, 10)?.id_translation).toBe(10);
    expect(pickEpisodeEntry(fileList, 1, 1)?.id_translation).toBe(79);
    expect(pickEpisodeEntry(fileList, 1, 2)?.id_translation).toBe(10);
    expect(pickEpisodeEntry(fileList, 9, 1)).toBeNull();
  });

  it('parsePlayerFileList decodes JSON.parse string', () => {
    const safeHtml =
      "const fileList = JSON.parse('{\"type\":\"serial\",\"all\":{\"1\":{\"1\":{\"1\":{\"id\":1,\"translation\":\"A\",\"id_translation\":1,\"quality\":\"720\",\"id_quality\":1}}}}}');";
    const parsed = parsePlayerFileList(safeHtml);
    expect(parsed?.type).toBe('serial');
    expect(parsed?.all['1']['1']['1'].id_translation).toBe(1);
    expect(parsePlayerFileList('<html></html>')).toBeNull();
  });
});
