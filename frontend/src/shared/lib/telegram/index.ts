import React from 'react';

const webApp = () => window.Telegram?.WebApp;

/** Telegram supports these since Bot API 6.1–6.2; guard for older clients. */
const supports = (version: string) =>
  webApp()?.isVersionAtLeast?.(version) ?? false;

export interface TelegramUser {
  name: string;
  photoUrl?: string;
}

/** The Telegram user who opened the mini app, when running inside Telegram. */
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

/**
 * Shows Telegram's native back button (and wires the Android back gesture)
 * while the component is mounted. No-op outside Telegram.
 */
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

/** Asks for confirmation before the mini app is closed while mounted. */
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
