import type { Messages } from '@lingui/core';

import type { Locale } from './constants';

type CatalogModule = { messages: Messages };

export const catalogLoaders: Record<Locale, () => Promise<CatalogModule>> = {
  en: () => import('../../../locales/en/messages.po'),
  ru: () => import('../../../locales/ru/messages.po'),
};
