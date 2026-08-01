import { absolutize, stripTags } from '@/src/api/client';
import { BASE_URL } from '@/src/api/types';

describe('absolutize', () => {
  it('returns undefined for empty', () => {
    expect(absolutize(null)).toBeUndefined();
    expect(absolutize(undefined)).toBeUndefined();
    expect(absolutize('')).toBeUndefined();
  });

  it('keeps absolute http(s)', () => {
    expect(absolutize('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
  });

  it('expands protocol-relative and root-relative', () => {
    expect(absolutize('//cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(absolutize('/uploads/a.jpg')).toBe(`${BASE_URL}/uploads/a.jpg`);
    expect(absolutize('uploads/a.jpg')).toBe(`${BASE_URL}/uploads/a.jpg`);
  });

  it('rewrites newdeaf.site to BASE_URL', () => {
    expect(absolutize('https://newdeaf.site/img.jpg')).toBe(`${BASE_URL}/img.jpg`);
    expect(absolutize('http://www.newdeaf.site/img.jpg')).toBe(`${BASE_URL}/img.jpg`);
  });
});

describe('stripTags', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripTags('<b>Hello</b>  <i>World</i>')).toBe('Hello World');
  });

  it('turns br into newline then collapses', () => {
    expect(stripTags('a<br/>b')).toBe('a b');
  });

  it('decodes entities', () => {
    expect(stripTags('A&nbsp;&amp;&quot;B&quot;')).toBe('A &"B"');
  });
});
