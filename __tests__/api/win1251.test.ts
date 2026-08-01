import { decodeWin1251, encodeWin1251, encodeWin1251FormValue } from '@/src/api/win1251';

describe('win1251', () => {
  it('round-trips ASCII', () => {
    const s = 'Hello World';
    expect(decodeWin1251(encodeWin1251(s))).toBe(s);
  });

  it('round-trips Cyrillic', () => {
    const s = 'Привет';
    expect(decodeWin1251(encodeWin1251(s))).toBe(s);
  });

  it('encodes unknown unicode as ?', () => {
    const bytes = encodeWin1251('🙂');
    expect(bytes[0]).toBe(0x3f);
  });

  it('form-encodes spaces as + and percent-encodes Cyrillic', () => {
    expect(encodeWin1251FormValue('a b')).toBe('a+b');
    const form = encodeWin1251FormValue('фильм');
    expect(form).toMatch(/%[0-9A-F]{2}/);
    expect(form).not.toContain('ф');
  });

  it('keeps unreserved form characters', () => {
    expect(encodeWin1251FormValue('Ab9-._*')).toBe('Ab9-._*');
  });
});
