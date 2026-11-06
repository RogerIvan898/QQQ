import { RouterProvider } from '@tanstack/react-router';

import { I18nProvider } from './providers/i18n';
import { router } from './providers/router';

export const App = () => (
  <I18nProvider>
    <RouterProvider router={router} />
  </I18nProvider>
);
