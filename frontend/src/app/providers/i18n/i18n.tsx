import type { PropsWithChildren } from 'react';

import { I18nProvider as LinguiProvider } from '@lingui/react';

import { i18n } from 'shared/lib/i18n';

export const I18nProvider = ({ children }: PropsWithChildren) => (
  <LinguiProvider i18n={i18n}>{children}</LinguiProvider>
);
