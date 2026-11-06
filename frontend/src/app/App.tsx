import { RouterProvider } from '@tanstack/react-router';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

import { getTonConnectManifestUrl } from 'shared/config/tonconnect';

import { I18nProvider } from './providers/i18n';
import { router } from './providers/router';

export const App = () => (
  <I18nProvider>
    <TonConnectUIProvider manifestUrl={getTonConnectManifestUrl()}>
      <RouterProvider router={router} />
    </TonConnectUIProvider>
  </I18nProvider>
);
