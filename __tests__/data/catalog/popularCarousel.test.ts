import { parsePopularCarousel } from '@/src/data/catalog/parsePopular';
import { BASE_URL } from '@/src/data/catalog/types';

function item(href: string, title: string, src: string): string {
  return `
    <a class="popular-item-img" href="${href}">
      <div class="popular-item-title">${title}</div>
      <img src="${src}" alt="">
    </a>
  `;
}

describe('parsePopularCarousel', () => {
  it('parses owl-popular HTML with 3 unique items', () => {
    const html = `
      <div id="owl-popular">
        ${item('/101-first-film.html', 'First Film (2021) онлайн', '/uploads/101.jpg')}
        ${item('/102-second-film.html', 'Second Film с русскими субтитрами extra', '//cdn.example/102.jpg')}
        ${item('/103-third-(2019).html', 'Third Film русские субтитры', 'https://img.example/103.jpg')}
      </div>
    `;
    const items = parsePopularCarousel(html);
    expect(items).toHaveLength(3);
    expect(items.map((m) => m.id)).toEqual(['101', '102', '103']);
    expect(items[0].title).toBe('First Film (2021)');
    expect(items[0].year).toBe('2021');
    expect(items[0].posterUrl).toBe(`${BASE_URL}/uploads/101.jpg`);
    expect(items[1].title).toBe('Second Film');
    expect(items[1].posterUrl).toBe('https://cdn.example/102.jpg');
    expect(items[2].year).toBe('2019');
    expect(items[2].posterUrl).toBe('https://img.example/103.jpg');
  });

  it('dedupes the same id and skips empty titles / unparseable hrefs', () => {
    const html = `
      <div id='owl-popular'>
        ${item('/200-once.html', 'Once', '/once.jpg')}
        ${item('/200-once.html', 'Once again', '/once2.jpg')}
        ${item('/about.html', 'About page', '/about.jpg')}
        ${item('/201-blank.html', '   ', '/blank.jpg')}
        ${item('/202-ok.html', 'Ok Film', '/ok.jpg')}
      </div>
      <div id="owl-other">
        ${item('/999-ignored.html', 'Ignored', '/ignored.jpg')}
      </div>
    `;
    const items = parsePopularCarousel(html);
    expect(items.map((m) => m.id)).toEqual(['200', '202']);
  });

  it('returns [] when owl-popular is missing', () => {
    expect(parsePopularCarousel('<div id="owl-new">nope</div>')).toEqual([]);
    expect(parsePopularCarousel('')).toEqual([]);
  });
});
