export const LOCALES = {
  en: 'English',
  ru: 'Русский',
} as const;

export type Locale = keyof typeof LOCALES;

export const supportedLocales = Object.keys(LOCALES) as Locale[];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_STORAGE_KEY = 'poker:locale';
