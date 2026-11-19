export { i18n } from '@lingui/core';
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  supportedLocales,
} from './constants';
export type { Locale } from './constants';
export { $currentLocale, changeLocale, prepareI18n } from './model';
export { getBootLocaleError } from './locale';
export { preloadOtherLocales } from './catalogs';
