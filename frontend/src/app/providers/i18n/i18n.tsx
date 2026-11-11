import { Suspense, type ReactNode } from 'react';

import { I18nProvider as LinguiProvider } from '@lingui/react';
import { useGate, useUnit } from 'effector-react';

import {
  $isI18nReady,
  getBootLoadingLabel,
  i18n,
  I18nGate,
  waitForLocale,
} from 'shared/lib/i18n';
import { Preloader } from 'shared/ui/preloader';

const LocaleReady = ({ children }: { children: ReactNode }) => {
  const ready = useUnit($isI18nReady);

  if (!ready) {
    throw waitForLocale();
  }

  return children;
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  useGate(I18nGate);

  return (
    <LinguiProvider i18n={i18n}>
      <Suspense fallback={<Preloader label={getBootLoadingLabel()} />}>
        <LocaleReady>{children}</LocaleReady>
      </Suspense>
    </LinguiProvider>
  );
};
