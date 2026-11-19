import { createRoot } from 'react-dom/client';

import { sample } from 'effector';

import { App } from 'app/App';
import { router } from 'app/providers/router';
import { sessionModel } from 'entities/session';
import { walletModel } from 'entities/wallet';
import { bootstrapMockServer } from 'features/mock-server';
import { appStarted } from 'shared/config/init';
import { initTelegramWebApp } from 'shared/config/telegram-webapp';
import { getBootLocaleError, prepareI18n } from 'shared/lib/i18n';
import { initPressFeedback } from 'shared/lib/press-feedback';
import { preloadTonConnect } from 'shared/lib/ton-connect';
import { Button } from 'shared/ui/button';

import './index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element was not found');
}

sample({
  clock: sessionModel.$currentUserId.updates,
  target: walletModel.walletAccountChanged,
});

void (async () => {
  initTelegramWebApp();
  initPressFeedback();
  await bootstrapMockServer().catch((error: unknown) => {
    console.error('[MockServer] Failed to start', error);
  });
  appStarted();

  try {
    await Promise.all([
      prepareI18n(),
      sessionModel.waitForAuth(),
      router.load().catch((error: unknown) => {
        console.error('[Router] Initial load failed', error);
      }),
    ]);
  } catch (error) {
    console.error('[i18n] Could not initialize the locale', error);

    const { message, retry } = getBootLocaleError();
    createRoot(root).render(
      <div className="boot" role="alert">
        <div className="boot__content">
          <p className="boot__label">{message}</p>
          <Button
            color="primary"
            text={retry}
            onClick={() => window.location.reload()}
          />
        </div>
      </div>
    );

    return;
  }

  createRoot(root).render(<App />);
  preloadTonConnect();
})();
