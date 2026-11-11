import type { Messages } from '@lingui/core';

import type { Locale } from './constants';

type CatalogModule = { messages: Messages };

export const catalogLoaders: Record<Locale, () => Promise<CatalogModule>> = {
  en: () => import('../../../locales/en/messages.po'),
  ru: () => import('../../../locales/ru/messages.po'),
};

export const preloadOtherLocales = (current: Locale | null) => {
  (Object.keys(catalogLoaders) as Locale[])
    .filter(locale => locale !== current)
    .forEach(locale => {
      void catalogLoaders[locale]().catch(() => undefined);
    });
};
