import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { en } from './en';
import { ru } from './ru';

const i18n = new I18n({ ru, en });

const languageCode = getLocales()[0]?.languageCode?.toLowerCase() ?? 'en';
i18n.locale = languageCode === 'ru' ? 'ru' : 'en';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export type TxKey = string;

type Scope = Record<string, unknown>;

/** Translate a dotted key, e.g. `tabs.catalog`. Supports %{name} interpolations. */
export function t(key: string, options?: Scope): string {
  return i18n.t(key, options);
}

export function getLocale(): 'ru' | 'en' {
  return i18n.locale === 'ru' ? 'ru' : 'en';
}

export { i18n };
