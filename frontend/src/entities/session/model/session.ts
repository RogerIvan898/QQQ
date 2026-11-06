import { createEffect, createStore, sample } from 'effector';

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
