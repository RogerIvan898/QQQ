import { createEffect, createEvent, createStore, sample } from 'effector';

import { tokenManager } from 'shared/api';
import { appStarted } from 'shared/config/init';
import { readStorage, writeStorage } from 'shared/lib/storage';

import { authApi } from '../api';

export const VIEWER_ID = '100';

const loginFx = createEffect(async () => {
  const initData = window.Telegram?.WebApp?.initData ?? '';
  const session = await authApi.login(initData);

  tokenManager.setToken(session.accessToken ?? null);

  return session.user;
});

export const $currentUserId = createStore<string | null>(null)
  .on(loginFx.doneData, (_, user) => user.id)
  .reset(loginFx.fail);

export const $authStatus = createStore<'pending' | 'ready' | 'failed'>(
  'pending'
)
  .on(loginFx.done, () => 'ready')
  .on(loginFx.fail, () => 'failed');

const authReady = new Promise<void>(resolve => {
  const unsubscribe = $authStatus.updates.watch(status => {
    if (status !== 'pending') {
      unsubscribe();
      resolve();
    }
  });
});

export const waitForAuth = () => authReady;

sample({
  clock: appStarted,
  target: loginFx,
});

tokenManager.onSessionExpired(() => {
  void loginFx();
});

export const NICKNAME_KEY = 'poker:nickname';

export const saveNickname = createEvent<string>();

export const $nickname = createStore<string | null>(
  readStorage(NICKNAME_KEY)
).on(saveNickname, (_, nickname) => nickname);

$nickname.updates.watch(nickname => {
  if (nickname) {
    writeStorage(NICKNAME_KEY, nickname);
  }
});
