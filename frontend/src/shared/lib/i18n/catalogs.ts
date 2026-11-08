import type { Messages } from '@lingui/core';

import type { Locale } from './constants';

type CatalogModule = { messages: Messages };

export const catalogLoaders: Record<Locale, () => Promise<CatalogModule>> = {
  en: () => import('../../../locales/en/messages.po'),
  ru: () => import('../../../locales/ru/messages.po'),
};

/**
 * Fetches every catalog except the active one in the background. Startup
 * only loads the current language; the rest are pulled in when the player
 * opens Settings, so switching language there is instant. The module
 * system caches each import, so calling this again costs nothing.
 */
export const preloadOtherLocales = (current: Locale | null) => {
  (Object.keys(catalogLoaders) as Locale[])
    .filter(locale => locale !== current)
    .forEach(locale => {
      void catalogLoaders[locale]().catch(() => undefined);
    });
};
