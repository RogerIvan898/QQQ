import React from 'react';

const webApp = () => window.Telegram?.WebApp;

const supports = (version: string) =>
  webApp()?.isVersionAtLeast?.(version) ?? false;

export const hasTelegramBackButton = () =>
  Boolean(webApp()?.initData) && supports('6.1');

export interface TelegramUser {
  name: string;
  photoUrl?: string;
}

export const getTelegramUser = (): TelegramUser | null => {
  const user = webApp()?.initDataUnsafe?.user;

  if (!user) {
    return null;
  }

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    '';

  return name ? { name, photoUrl: user.photo_url } : null;
};

export const useTelegramBackButton = (onBack: () => void) => {
  const onBackRef = React.useRef(onBack);

  React.useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  React.useEffect(() => {
    const tg = webApp();

    if (!tg || !supports('6.1')) {
      return;
    }

    const handler = () => onBackRef.current();

    tg.BackButton.onClick(handler);
    tg.BackButton.show();

    return () => {
      tg.BackButton.offClick(handler);
      tg.BackButton.hide();
    };
  }, []);
};

export const useTelegramClosingConfirmation = (enabled = true) => {
  React.useEffect(() => {
    const tg = webApp();

    if (!enabled || !tg || !supports('6.2')) {
      return;
    }

    tg.enableClosingConfirmation();

    return () => tg.disableClosingConfirmation();
  }, [enabled]);
};
