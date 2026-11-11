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

export const activateLocale = async (locale: Locale) => {
  const { messages } = await catalogLoaders[locale]();

  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
  writeStorage(LOCALE_STORAGE_KEY, locale);

  return locale;
};
