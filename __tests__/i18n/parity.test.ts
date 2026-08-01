import { en } from '@/src/i18n/en';
import { ru } from '@/src/i18n/ru';
import { mapSystemLanguageCode, setLocale, t, getLocale } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';

function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...leafKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('i18n key parity', () => {
  it('ru and en expose the same leaf keys', () => {
    const ruKeys = leafKeys(ru as unknown as Record<string, unknown>).sort();
    const enKeys = leafKeys(en as unknown as Record<string, unknown>).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('mapSystemLanguageCode maps only ru to ru', () => {
    expect(mapSystemLanguageCode('ru')).toBe('ru');
    expect(mapSystemLanguageCode('RU')).toBe('ru');
    expect(mapSystemLanguageCode('en')).toBe('en');
    expect(mapSystemLanguageCode('de')).toBe('en');
    expect(mapSystemLanguageCode(null)).toBe('en');
  });

  it('t returns strings for both locales', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('settings.title').length).toBeGreaterThan(0);
    setLocale('ru');
    expect(getLocale()).toBe('ru');
    expect(t('settings.title').length).toBeGreaterThan(0);
    expect(t('settings.version', { version: '1.0.0' })).toContain('1.0.0');
  });
});

describe('theme tokens', () => {
  it('exports core design tokens', () => {
    expect(colors.bg).toBeTruthy();
    expect(colors.accent).toBeTruthy();
    expect(spacing.md).toBeGreaterThan(0);
    expect(radius.md).toBeGreaterThan(0);
    expect(fonts.regular).toBeTruthy();
  });
});
