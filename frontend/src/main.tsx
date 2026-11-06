import { createRoot } from 'react-dom/client';

import { App } from 'app/App';
import { router } from 'app/providers/router';
import 'entities/session';
// Importing the model segment only keeps the dev-only switch UI out of the production bundle.
import { bootstrapMockServer } from 'features/mock-server/model';
import { appStarted } from 'shared/config/init';
import { initTelegramWebApp } from 'shared/config/telegram-webapp';
import { prepareI18n } from 'shared/lib/i18n';

import './index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element was not found');
}

void (async () => {
  initTelegramWebApp();
  await bootstrapMockServer().catch((error: unknown) => {
    console.error('[MockServer] Failed to start', error);
  });
  appStarted();

  // Keep the static boot screen from index.html up until translations and
  // the first route's code are loaded, then render the finished page in one
  // go. Otherwise several loaders replace each other and the screen blinks.
  await Promise.all([
    prepareI18n(),
    router.load().catch((error: unknown) => {
      // The router's error screen will handle it after render.
      console.error('[Router] Initial load failed', error);
    }),
  ]);

  createRoot(root).render(<App />);
})();
