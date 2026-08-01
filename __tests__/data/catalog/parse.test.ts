import {
  buildPlayerUrl,
  isNativeBalancerUrl,
  listEpisodes,
  listSeasons,
  parseCatalogPage,
  parseHasMorePages,
  parseMovieDetail,
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

  it('parses absolute slug paths', () => {
    expect(parseMovieIdFromHref('https://newdeaf.top/99-film.html')?.id).toBe('99');
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
  const card = (
    id: string,
    title: string,
    opts?: { kp?: boolean; imdb?: boolean; series?: boolean; dataText?: boolean }
  ) => `
    <div class="short-cols">
      <a class="short-img" href="/${id}-slug${opts?.series ? '-sezon' : ''}.html">
        <img src="/uploads/${id}.jpg" alt="${title}"/>
      </a>
      <span class="short-title">${title}</span>
      ${
        opts?.dataText
          ? `<span data-text="kp"><span>8.2</span></span><span data-text="imdb"><span>7.5</span></span>`
          : `<div class="short-rate-kp"><span>${opts?.kp === false ? '' : '7.1'}</span></div>
             <div class="short-rate-imdb"><span>6.5</span></div>`
      }
      ${opts?.series ? '<span>Сериалы</span>' : ''}
    </div>`;

  it('parses short-cols cards and ignores duplicates', () => {
    const html = `${card('10', 'Film A (2020)')}${card('10', 'Film A again')}${card('11', 'Film B')}`;
    const items = parseMovieList(html);
    expect(items.map((i) => i.id)).toEqual(['10', '11']);
    expect(items[0].title).toContain('Film A');
    expect(items[0].kpRating).toBe('7.1');
    expect(items[0].imdbRating).toBe('6.5');
  });

  it('detects series via genre block / title / slug and data-text ratings', () => {
    const html = `${card('20', 'Show (2021)', { series: true, dataText: true })}`;
    const items = parseMovieList(html);
    expect(items[0].isSeries).toBe(true);
    expect(items[0].kpRating).toBe('8.2');
    expect(items[0].imdbRating).toBe('7.5');
  });

  it('detects series from slug when title/block do not match', () => {
    const html = `
      <div class="short-cols">
        <a class="short-img" href="/21-my-sezon-one.html">
          <img src="/uploads/21.jpg" alt="Plain Title"/>
        </a>
        <span class="short-title">Plain Title</span>
      </div>
    `;
    expect(parseMovieList(html)[0].isSeries).toBe(true);
  });

  it('uses slug year and titleFromSlug in grid fallback', () => {
    const html = `
      <a href="/104-something-(2017).html">
        <img src="/uploads/posts/p.jpg" alt=""/>
      </a>
      <a href="/105-film-(2019)-x.html">
        <img src="/blockpro/x.jpg" alt="Named Film"/>
      </a>
    `;
    const items = parseMovieList(html);
    const emptyAlt = items.find((i) => i.id === '104');
    expect(emptyAlt?.title.length).toBeGreaterThan(0);
    expect(emptyAlt?.year).toMatch(/2017/);
    expect(items.find((i) => i.id === '105')?.year).toBe('2019');
    expect(items.find((i) => i.id === '105')?.title).toBe('Named Film');
  });

  it('skips cards without href and uses titleFromSlug when title missing', () => {
    const html = `
      <div class="short-cols"><div>no link</div></div>
      <div class="short-cols">
        <a class="short-img" href="/30-%ZZ-bad.html"><img src="/uploads/30.jpg"/></a>
      </div>
      <div class="short-cols">
        <a class="short-img" href="/31-my-film.html"><img src="/uploads/31.jpg"/></a>
      </div>
      <div class="short-cols">
        <a class="short-img" href="/32-serial-show.html">
          <img src="/uploads/32.jpg" alt="Show сериал (2020-2021)"/>
        </a>
      </div>
    `;
    const items = parseMovieList(html);
    expect(items.some((i) => i.id === '31')).toBe(true);
    // Invalid % encoding in slug still yields a title (titleFromSlug catch)
    const bad = items.find((i) => i.id === '30');
    expect(bad?.title.length).toBeGreaterThan(0);
    expect(items.find((i) => i.id === '32')?.isSeries).toBe(true);
    expect(items.find((i) => i.id === '32')?.year).toBe('2020-2021');
  });

  it('falls back to grid links when fewer than 4 short-cols', () => {
    const html = `
      <a href="/100-fallback-movie.html">
        <img src="/uploads/posts/poster.jpg" alt="Fallback Film (2018) сезон"/>
      </a>
      <a href="/101-no-img.html">plain text</a>
      <a href="/102-bad-src.html"><img src="/static/logo.png" alt="Logo"/></a>
      <a href="https://cdn.example/103-abs-movie.html">
        <img src="https://cdn.example/blockpro/x.jpg" alt="Abs (2019)"/>
      </a>
    `;
    const items = parseMovieList(html);
    expect(items.map((i) => i.id).sort()).toEqual(['100', '103']);
    expect(items.find((i) => i.id === '100')?.isSeries).toBe(true);
  });

  it('uses href-only movie match when short-img class missing', () => {
    const html = `
      <div class="short-cols">
        <a href="/40-alt-path.html"><img src="/uploads/40.jpg" alt="Alt Path"/></a>
        <span class="short-title">Alt Path (2022) с русскими субтитрами онлайн</span>
      </div>
    `;
    const items = parseMovieList(html);
    expect(items[0].id).toBe('40');
    expect(items[0].title).toBe('Alt Path (2022)');
  });

  it('hasMore from navigation absolute year paths or >=20 items', () => {
    const withNav = `${card('1', 'A')}<div class="navigation"><a href="/page/2/">2</a></div>`;
    expect(parseHasMorePages(withNav, 1)).toBe(true);
    expect(parseCatalogPage(withNav, 1).hasMore).toBe(true);
    expect(parseHasMorePages(card('1', 'A'), 1)).toBe(false);

    const yearNav = `<div class="navigation"><a href="/2024/page/3/">3</a></div>`;
    expect(parseHasMorePages(yearNav, 2)).toBe(true);
    expect(parseHasMorePages(yearNav, 3)).toBe(false);

    const many = Array.from({ length: 20 }, (_, i) => card(String(200 + i), `M${i}`)).join('');
    expect(parseCatalogPage(many, 1).hasMore).toBe(true);
  });
});

describe('parseSearchResults', () => {
  it('parses short-title links', () => {
    const html = `
      <a href="/42-movie.html"><span class="short-title">Search Hit (2021)</span></a>
      <img src="/uploads/x.jpg"/>
      <span data-text="kp"><span>9.0</span></span>
    `;
    const items = parseSearchResults(html);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('42');
    expect(items[0].kpRating).toBe('9.0');
  });

  it('dedupes short-title hits', () => {
    const html = `
      <a href="/42-movie.html"><span class="short-title">A</span></a>
      <a href="/42-movie.html"><span class="short-title">A again</span></a>
    `;
    expect(parseSearchResults(html)).toHaveLength(1);
  });

  it('falls back to absolute href scan when no short-title', () => {
    const html = `
      <a href="https://newdeaf.top/77-abs-hit.html">
        <img src="/uploads/posts/a.jpg" alt="Abs Hit (2020) сериал"/>
      </a>
      <a href="https://newdeaf.top/77-abs-hit.html">dup</a>
      <a href="https://newdeaf.top/78-slug-only.html">no title nearby</a>
    `;
    const items = parseSearchResults(html);
    expect(items.find((i) => i.id === '77')?.title).toContain('Abs Hit');
    expect(items.find((i) => i.id === '77')?.isSeries).toBe(true);
    expect(items.find((i) => i.id === '78')?.title).toMatch(/Slug Only/i);
  });

  it('uses uploads path match without img tag in window', () => {
    const html = `
      <img />
      uploads/blockpro/poster.jpg
      <a href="/55-path.html"><span class="short-title">Path Hit</span></a>
    `;
    const items = parseSearchResults(html);
    expect(items[0].posterUrl).toContain('uploads/blockpro');
  });
});

describe('parseMovieDetail', () => {
  it('parses a full detail page with native player, trailer, and meta lists', () => {
    const html = `
      <meta property="og:title" content="NewDeaf.ru : Film / English Title (2020)"/>
      <meta property="og:image" content="https://newdeaf.site/uploads/posts/og.jpg"/>
      <img class="puk-puk" src="/uploads/posts/poster.jpg"/>
      <div class="short-rate-in short-rate-kp"><span>8.1</span></div>
      <div class="short-rate-in short-rate-imdb"><span>7.2</span></div>
      <div id="fltxt">Plot &amp; more</div>
      <ul>
        <li>Жанр: <a href="/genre/action/">Action</a>, <a href="/genre/drama/">Drama</a></li>
        <li>Актеры: <a href="#">Actor One</a>, <a href="#">Actor Two</a></li>
        <li>Страна: USA</li>
        <li>Режиссер: Jane Doe</li>
        <li>Время: </span> 120 мин</li>
      </ul>
      <span id="l-12">+42</span>
      <div id="preroll"><iframe src="https://stloadi.live/embed?token=preroll"></iframe></div>
      <iframe src="https://stravers.live/embed?token=abc&token_movie=tm&translation=79&season=2&episode=3"></iframe>
      <div data-tr="https://www.youtube.com/embed/abc123XYZ"></div>
      <div data-original_title="Original EN"></div>
    `;
    const detail = parseMovieDetail(html, '/123-film.html');
    expect(detail.id).toBe('123');
    expect(detail.title).toMatch(/English Title|Film/);
    expect(detail.posterUrl).toContain('uploads/posts');
    expect(detail.kpRating).toBe('8.1');
    expect(detail.imdbRating).toBe('7.2');
    expect(detail.description).toContain('Plot');
    expect(detail.genres).toEqual(['Action', 'Drama']);
    expect(detail.genreHrefs).toHaveLength(2);
    expect(detail.actors).toEqual(['Actor One', 'Actor Two']);
    expect(detail.country).toBe('USA');
    expect(detail.director).toBe('Jane Doe');
    expect(detail.duration).toContain('120');
    expect(detail.likes).toBe('42');
    expect(detail.nativePlayer).toBe(true);
    expect(detail.playerUrl).toContain('stravers.live');
    expect(detail.playerToken).toBe('abc');
    expect(detail.tokenMovie).toBe('tm');
    expect(detail.translationId).toBe('79');
    expect(detail.season).toBe(2);
    expect(detail.episode).toBe(3);
    expect(detail.trailerYoutubeId).toBe('abc123XYZ');
    expect(detail.originalTitle).toBe('Original EN');
  });

  it('handles missing href, title fallback, актёры/режиссёр, non-native embed', () => {
    const html = `
      <title>NewDeaf | Bare Title</title>
      <div class="poster"><img src="/uploads/posts/x.jpg"/></div>
      <span data-text="kp"><span>5.5</span></span>
      <span data-text="imdb"><span>5.0</span></span>
      <div class="full-text">Full text plot</div>
      <ul>
        <li>Жанр:</span> Comedy / Sci-Fi</li>
        <li>Актёры: Solo Actor</li>
        <li>Режиссёр: Solo Dir</li>
        <li>Время: 90 мин</li>
      </ul>
      <span class="count">+9</span>
      <iframe src="https://kodik.info/embed/1"></iframe>
      <div data-tr="https://www.youtube-nocookie.com/embed/trail99"></div>
    `;
    const detail = parseMovieDetail(html, '/not-a-movie-path');
    expect(detail.id).toBe('0');
    expect(detail.title).toContain('Bare Title');
    expect(detail.genres).toEqual(['Comedy', 'Sci-Fi']);
    expect(detail.actors).toEqual(['Solo Actor']);
    expect(detail.director).toBe('Solo Dir');
    expect(detail.nativePlayer).toBe(false);
    expect(detail.playerUrl).toContain('kodik');
    expect(detail.fallbackPlayerUrl).toContain('kodik');
    expect(detail.trailerYoutubeId).toBe('trail99');
  });

  it('uses titleFromSlug when og title empty and invalid native player URL', () => {
    // Malformed URL: normalizePlayerSrc returns trimmed; isNativeBalancerUrl catch matches host
    const detail = parseMovieDetail(
      `<iframe src="https://stloadi.live["></iframe>`,
      '/55-my-cool-slug.html'
    );
    expect(detail.title).toMatch(/My Cool Slug/i);
    expect(detail.nativePlayer).toBe(true);
    expect(detail.playerUrl).toBe('https://stloadi.live[');
    // playerUrl token parse catch (new URL throws)
    expect(detail.playerToken).toBeUndefined();
  });

  it('splits bilingual og title preferring year segment', () => {
    const html = `
      <meta property="og:title" content="Русское / English Name (2019)"/>
      <div class="poster-box"><img src="https://cdn.example/p.jpg" class="poster"/></div>
      <ul><li>Жанр:</b> <a href="/g/">G</a></li></ul>
      <iframe src="https://embess.ws/e/1"></iframe>
    `;
    const detail = parseMovieDetail(html, '/56-x.html');
    expect(detail.title).toContain('English Name');
    expect(detail.year).toBe('2019');
    expect(detail.playerUrl).toContain('embess.ws');
  });

  it('uses og:image and trailer embed without youtube id pattern', () => {
    const html = `
      <meta property="og:title" content="Z"/>
      <meta property="og:image" content="https://cdn.example/og.jpg"/>
      <div data-tr="https://www.youtube.com/embed/ab"></div>
      <iframe src="https://kinoserial.net/e/1"></iframe>
    `;
    const detail = parseMovieDetail(html, '/57-z.html');
    expect(detail.posterUrl).toContain('cdn.example/og.jpg');
    expect(detail.trailerUrl).toContain('youtube.com/embed/ab');
    expect(detail.trailerYoutubeId).toBeUndefined();
  });

  it('prefers season>=2 preroll candidate and drops season-1 preroll ads', () => {
    // Two natives so sort invokes scoreNativeCandidate / isPrerollContext
    const withPrerollAd = `
      <div id="preroll"><iframe src="https://stloadi.live/embed?token=ad&season=1"></iframe></div>
      <iframe src="https://stloadi.live/embed?token=real&token_movie=tm&season=1&episode=1"></iframe>
    `;
    const d1 = parseMovieDetail(withPrerollAd, '/1-a.html');
    expect(d1.playerUrl).toContain('token=real');

    const season2InPreroll = `
      <div id="preroll"><iframe src="https://stloadi.live/embed?token=s2&season=2&episode=1"></iframe></div>
      <iframe src="https://stravers.live/embed?token=other&season=1"></iframe>
    `;
    expect(parseMovieDetail(season2InPreroll, '/2-b.html').playerUrl).toContain('season=2');

    const tokenMovieNoSeason1 = `
      <div id="preroll"><iframe src="https://stloadi.live/embed?token=x&token_movie=tm"></iframe></div>
      <iframe src="https://biorn-as.cdn.example/embed?token=y"></iframe>
    `;
    expect(parseMovieDetail(tokenMovieNoSeason1, '/3-c.html').playerUrl).toContain('token_movie');
  });

  it('dedupes identical iframe srcs and scores biorn host', () => {
    const html = `
      <iframe src="https://biorn-as.cdn.example/embed?token=1"></iframe>
      <iframe src="https://biorn-as.cdn.example/embed?token=1"></iframe>
      <iframe src="https://stloadi.live/embed?token=2"></iframe>
    `;
    const detail = parseMovieDetail(html, '/60-dup.html');
    expect(detail.nativePlayer).toBe(true);
    expect(detail.playerUrl).toMatch(/biorn-as|stloadi/);
  });

  it('returns no player when page has no iframes', () => {
    const detail = parseMovieDetail(
      `<meta property="og:title" content="No Player"/>`,
      '/61-none.html'
    );
    expect(detail.playerUrl).toBeUndefined();
    expect(detail.nativePlayer).toBe(false);
  });

  it('prefers embess playerUrl and keeps fsst as soft fallback', () => {
    const html = `
      <meta property="og:title" content="Prada 2"/>
      <iframe src="https://api.embess.ws/embed/movie/1"></iframe>
      <iframe src="https://tv-1-kinoserial.net/embed/1"></iframe>
      <iframe src="https://fsst.online/embed/1019620/"></iframe>
    `;
    const detail = parseMovieDetail(html, '/10759-prada.html');
    expect(detail.nativePlayer).toBe(false);
    expect(detail.playerUrl).toContain('embess.ws');
    expect(detail.fallbackPlayerUrl).toContain('fsst.online');
  });

  it('falls back to last bilingual segment when no year in parts', () => {
    const html = `
      <meta property="og:title" content="Русское / English Only"/>
      <iframe src="https://alloha.tv/e/1"></iframe>
    `;
    expect(parseMovieDetail(html, '/62-bi.html').title).toContain('English Only');
  });

  it('keeps original title when bilingual split parts are empty', () => {
    const html = `
      <meta property="og:title" content=" / "/>
      <iframe src="https://fsst.online/e/1"></iframe>
    `;
    // all segments empty after trim → fall through to prior title value
    const detail = parseMovieDetail(html, '/63-empty.html');
    expect(detail.title).toBeTruthy();
  });

  it('scores native urls without token query param', () => {
    const html = `
      <iframe src="https://stloadi.live/embed?season=1"></iframe>
      <iframe src="https://stravers.live/embed?season=1"></iframe>
    `;
    const detail = parseMovieDetail(html, '/64-notoken.html');
    expect(detail.nativePlayer).toBe(true);
    expect(detail.playerUrl).toContain('stravers.live');
  });

  it('picks generic non-youtube fallback when no known hosts', () => {
    const html = `
      <iframe src="https://newdeaf.ru/sidebar"></iframe>
      <iframe src="https://www.youtube.com/embed/x"></iframe>
      <iframe src="https://player.other.cdn/embed"></iframe>
    `;
    const detail = parseMovieDetail(html, '/9-z.html');
    expect(detail.playerUrl).toContain('player.other.cdn');
    expect(detail.nativePlayer).toBe(false);
  });

  it('handles itemprop description and empty duration / invalid season numbers', () => {
    const html = `
      <meta property="og:title" content="T (2021)"/>
      <span itemprop="description">Desc</span>
      <ul><li>Время: </li></ul>
      <iframe src="https://stloadi.live/p?token=1&season=abc&episode=xyz"></iframe>
    `;
    const detail = parseMovieDetail(html, '/8-t.html');
    expect(detail.description).toBe('Desc');
    expect(detail.duration).toBeUndefined();
    expect(detail.season).toBeUndefined();
    expect(detail.episode).toBeUndefined();
  });

  it('skips empty iframe src and uses uploads path / src-class poster order', () => {
    const html = `
      <meta property="og:title" content="X"/>
      <img src="/uploads/posts/a.jpg" class="puk-puk"/>
      <iframe src="https://voidboost.cc/e/1"></iframe>
    `;
    const detail = parseMovieDetail(html, '/4-x.html');
    expect(detail.posterUrl).toContain('uploads/posts');
    expect(detail.playerUrl).toContain('voidboost');
  });

  it('covers preroll-only native and malformed preroll src catch', () => {
    const onlyPreroll = `
      <div id="preroll"><iframe src="https://stloadi.live/embed?token=only"></iframe></div>
    `;
    expect(parseMovieDetail(onlyPreroll, '/5-p.html').playerUrl).toContain('stloadi.live');

    // isPrerollContext URL parse catch → still treated as preroll
    const badPreroll = `
      <div id="preroll"><iframe src="https://stloadi.live["></iframe></div>
      <iframe src="https://stravers.live/embed?token=good&token_movie=tm"></iframe>
    `;
    expect(parseMovieDetail(badPreroll, '/6-p.html').playerUrl).toContain('stravers.live');
  });

  it('cleans russian subtitle suffixes from titles', () => {
    const html = `
      <meta property="og:title" content="Movie Name русские субтитры смотреть"/>
      <iframe src="https://videocdn.tv/e/1"></iframe>
    `;
    expect(parseMovieDetail(html, '/58-m.html').title).toBe('Movie Name');
  });
});

describe('isNativeBalancerUrl', () => {
  it('detects known hosts and port 9443', () => {
    expect(isNativeBalancerUrl('https://stloadi.live/embed/x')).toBe(true);
    expect(isNativeBalancerUrl('https://stravers.live/p')).toBe(true);
    expect(isNativeBalancerUrl('https://biorn-as.cdn.example/p')).toBe(true);
    expect(isNativeBalancerUrl('https://evil.com:9443/x')).toBe(true);
    expect(isNativeBalancerUrl('https://evil.com')).toBe(false);
  });

  it('falls back to regex when URL constructor throws', () => {
    expect(isNativeBalancerUrl('https://stloadi.live[')).toBe(true);
    expect(isNativeBalancerUrl('stravers.live/x')).toBe(true);
    expect(isNativeBalancerUrl('biorn-as.x')).toBe(true);
    expect(isNativeBalancerUrl('host:9443/x')).toBe(true);
    expect(isNativeBalancerUrl('not a url at all')).toBe(false);
  });
});

describe('player helpers', () => {
  it('buildPlayerUrl sets season/episode/translation/time', () => {
    const url = buildPlayerUrl('https://player.example/embed?token=1', {
      season: 2,
      episode: 5,
      translation: 79,
      time: 90.7,
    });
    expect(url).toContain('season=2');
    expect(url).toContain('episode=5');
    expect(url).toContain('translation=79');
    expect(url).toContain('time=90');
  });

  it('omits time when zero and returns base on invalid URL', () => {
    const url = buildPlayerUrl('https://player.example/embed', { time: 0 });
    expect(url).not.toContain('time=');
    expect(buildPlayerUrl('not-a-url', { season: 1 })).toBe('not-a-url');
  });
});

describe('fileList / pickEpisodeEntry', () => {
  const fileList: PlayerFileList = {
    type: 'serial',
    all: {
      '2': {
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
        '3': {},
      },
      '1': {
        '1': {
          '5': {
            id: 4,
            translation: 'Dub',
            id_translation: 5,
            quality: '720',
            id_quality: 1,
          },
        },
      },
      bad: {} as never,
    },
  };

  it('lists seasons and episodes sorted, skipping non-numeric keys', () => {
    expect(listSeasons(fileList)).toEqual([1, 2]);
    expect(listEpisodes(fileList, 2)).toEqual([1, 2, 3]);
    expect(listEpisodes(fileList, 99)).toEqual([]);
  });

  it('prefers preferred translation then subs id 79', () => {
    expect(pickEpisodeEntry(fileList, 2, 1, 10)?.id_translation).toBe(10);
    expect(pickEpisodeEntry(fileList, 2, 1, 999)?.id_translation).toBe(79);
    expect(pickEpisodeEntry(fileList, 2, 1)?.id_translation).toBe(79);
    expect(pickEpisodeEntry(fileList, 2, 2)?.id_translation).toBe(10);
    expect(pickEpisodeEntry(fileList, 1, 1)?.id_translation).toBe(5);
    expect(pickEpisodeEntry(fileList, 2, 3)).toBeNull();
    expect(pickEpisodeEntry(fileList, 9, 1)).toBeNull();
  });

  it('parsePlayerFileList decodes escapes and handles failures', () => {
    // \uXXXX decoded before JSON.parse; \\\\ becomes \\ so JSON still valid
    const withUnicode =
      "const fileList = JSON.parse('{\"type\":\"serial\",\"active\":{\"id\":1,\"translation\":\"\\u0041\",\"id_translation\":1,\"quality\":\"720\",\"id_quality\":1},\"all\":{\"1\":{\"1\":{\"1\":{\"id\":1,\"translation\":\"X\\\\\\\\Y\",\"id_translation\":1,\"quality\":\"720\",\"id_quality\":1}}}}}');";
    const parsed = parsePlayerFileList(withUnicode);
    expect(parsed?.type).toBe('serial');
    expect(parsed?.active?.translation).toBe('A');
    expect(parsed?.all['1']['1']['1'].translation).toBe('X\\Y');

    const movieType =
      "const fileList = JSON.parse('{\"type\":\"movie\",\"all\":{\"1\":{\"1\":{\"1\":{\"id\":1,\"translation\":\"A\",\"id_translation\":1,\"quality\":\"720\",\"id_quality\":1}}}}}');";
    expect(parsePlayerFileList(movieType)?.type).toBe('movie');

    expect(parsePlayerFileList('<html></html>')).toBeNull();
    expect(parsePlayerFileList("const fileList = JSON.parse('{\"type\":\"serial\"}');")).toBeNull();
    expect(parsePlayerFileList("const fileList = JSON.parse('{not-json}');")).toBeNull();
  });
});
