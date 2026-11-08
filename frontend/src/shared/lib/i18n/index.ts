export { i18n } from '@lingui/core';
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  supportedLocales,
} from './constants';
export type { Locale } from './constants';
export {
  $currentLocale,
  $isI18nReady,
  changeLocale,
  I18nGate,
  prepareI18n,
  waitForLocale,
} from './model';
export { getBootLoadingLabel } from './locale';
export { preloadOtherLocales } from './catalogs';
