const APP_BG = '#0a0e17';

const syncTelegramSafeArea = () => {
  const tg = window.Telegram?.WebApp;

  if (!tg) {
    return;
  }

  const safe = tg.safeAreaInset;
  const content = tg.contentSafeAreaInset;
  const root = document.documentElement;

  root.style.setProperty(
    '--tg-safe-area-top',
    `${(safe?.top ?? 0) + (content?.top ?? 0)}px`
  );
  root.style.setProperty(
    '--tg-safe-area-bottom',
    `${(safe?.bottom ?? 0) + (content?.bottom ?? 0)}px`
  );
  root.style.setProperty('--tg-safe-area-left', `${safe?.left ?? 0}px`);
  root.style.setProperty('--tg-safe-area-right', `${safe?.right ?? 0}px`);
};

export const initTelegramWebApp = () => {
  const tg = window.Telegram?.WebApp;

  if (!tg) {
    return;
  }

  tg.ready();
  tg.expand();
  tg.setHeaderColor(APP_BG);
  tg.setBackgroundColor(APP_BG);

  if (typeof tg.requestFullscreen === 'function') {
    try {
      tg.requestFullscreen();
    } catch {
      void 0;
    }
  }

  syncTelegramSafeArea();
  tg.onEvent('safeAreaChanged', syncTelegramSafeArea);
  tg.onEvent('contentSafeAreaChanged', syncTelegramSafeArea);
  tg.onEvent('fullscreenChanged', syncTelegramSafeArea);
};
