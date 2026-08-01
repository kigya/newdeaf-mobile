import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { en } from './en';
import { ru } from './ru';

const i18n = new I18n({ ru, en });

i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export type AppLocale = 'ru' | 'en';

export function mapSystemLanguageCode(code?: string | null): AppLocale {
  return code?.toLowerCase() === 'ru' ? 'ru' : 'en';
}

export function readSystemLocale(): AppLocale {
  return mapSystemLanguageCode(getLocales()[0]?.languageCode);
}

/** Apply UI locale (SSOT is settings store; this only updates i18n-js). */
export function setLocale(locale: AppLocale): void {
  i18n.locale = locale;
}

// Seed before hydrate so first paint is not empty; hydrate will overwrite.
setLocale(readSystemLocale());

export type TxKey = string;

type Scope = Record<string, unknown>;

/** Translate a dotted key, e.g. `tabs.catalog`. Supports %{name} interpolations. */
export function t(key: string, options?: Scope): string {
  return i18n.t(key, options);
}

export function getLocale(): AppLocale {
  return i18n.locale === 'ru' ? 'ru' : 'en';
}

export { i18n };
