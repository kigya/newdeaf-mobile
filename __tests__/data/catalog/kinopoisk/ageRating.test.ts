import { formatAgeRating } from '@/src/data/catalog/kinopoisk/ageRating';

describe('formatAgeRating', () => {
  it('turns Kinopoisk age18 tokens into 18+', () => {
    expect(formatAgeRating('age18')).toBe('18+');
    expect(formatAgeRating('age16')).toBe('16+');
    expect(formatAgeRating('AGE12')).toBe('12+');
    expect(formatAgeRating('age0')).toBe('0+');
    expect(formatAgeRating('  age6  ')).toBe('6+');
    expect(formatAgeRating('age18+')).toBe('18+');
  });

  it('keeps already-pretty values and drops blanks', () => {
    expect(formatAgeRating('16+')).toBe('16+');
    expect(formatAgeRating('18')).toBe('18+');
    expect(formatAgeRating('PG-13')).toBe('PG-13');
    expect(formatAgeRating('')).toBeUndefined();
    expect(formatAgeRating('   ')).toBeUndefined();
    expect(formatAgeRating(null)).toBeUndefined();
    expect(formatAgeRating(undefined)).toBeUndefined();
  });
});
