import { i18n } from '@lingui/core';

import { readStorage, writeStorage } from 'shared/lib/storage';

import { catalogLoaders } from './catalogs';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  supportedLocales,
  type Locale,
} from './constants';

const isLocale = (value: string | null): value is Locale =>
  Boolean(value && supportedLocales.includes(value as Locale));

export const detectLocale = (): Locale => {
  const stored = readStorage(LOCALE_STORAGE_KEY);

  if (isLocale(stored)) {
    return stored;
  }

  const telegramLang =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2);

  if (telegramLang && isLocale(telegramLang)) {
    return telegramLang;
  }

  const browserLang = navigator.language.slice(0, 2);

  if (isLocale(browserLang)) {
    return browserLang;
  }

  return DEFAULT_LOCALE;
};

const BOOT_LOADING_LABELS: Record<Locale, string> = {
  en: 'Loading…',
  ru: 'Загрузка…',
};

export const getBootLoadingLabel = () => BOOT_LOADING_LABELS[detectLocale()];

const CATALOG_ATTEMPTS = 3;

const loadCatalog = async (locale: Locale) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await catalogLoaders[locale]();
    } catch (error) {
      if (attempt >= CATALOG_ATTEMPTS) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    }
  }
};

export const activateLocale = async (locale: Locale): Promise<Locale> => {
  let messages;

  try {
    ({ messages } = await loadCatalog(locale));
  } catch (error) {
    if (locale === DEFAULT_LOCALE) {
      throw error;
    }

    return activateLocale(DEFAULT_LOCALE);
  }

  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
  writeStorage(LOCALE_STORAGE_KEY, locale);

  return locale;
};
