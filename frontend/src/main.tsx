import { createRoot } from 'react-dom/client';

import { App } from 'app/App';
import { router } from 'app/providers/router';
import { sessionModel } from 'entities/session';
import { bootstrapMockServer } from 'features/mock-server/model';
import { appStarted } from 'shared/config/init';
import { initTelegramWebApp } from 'shared/config/telegram-webapp';
import { prepareI18n } from 'shared/lib/i18n';
import { preloadTonConnect } from 'shared/lib/ton-connect';

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

  await Promise.all([
    prepareI18n(),

    sessionModel.waitForAuth(),
    router.load().catch((error: unknown) => {
      console.error('[Router] Initial load failed', error);
    }),
  ]);

  createRoot(root).render(<App />);
  preloadTonConnect();
})();
