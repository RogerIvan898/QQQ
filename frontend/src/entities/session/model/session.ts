import { createEffect, createEvent, createStore, sample } from 'effector';

import { appStarted } from 'shared/config/init';

import { authApi } from '../api';

const authFx = createEffect(() => {
  const tg = window.Telegram?.WebApp;

  if (!tg) {
    return;
  }

  return authApi.login(tg.initData);
});

export const VIEWER_ID = '100';

export const $currentUserId = createStore<string | null>(VIEWER_ID);

sample({
  clock: appStarted,
  target: authFx,
});

export const NICKNAME_KEY = 'poker:nickname';

const readNickname = () => {
  try {
    return localStorage.getItem(NICKNAME_KEY);
  } catch {
    return null;
  }
};

/** Set by the player next to their name in the menu. */
export const saveNickname = createEvent<string>();

/**
 * Local for now (no server yet): kept in this browser. Null until the player
 * picks one, then the Telegram name is replaced everywhere.
 */
export const $nickname = createStore<string | null>(readNickname()).on(
  saveNickname,
  (_, nickname) => nickname
);

$nickname.updates.watch(nickname => {
  try {
    if (nickname) {
      localStorage.setItem(NICKNAME_KEY, nickname);
    }
  } catch {
    // Private mode: keep it for this session only.
  }
});
