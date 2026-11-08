import { createEffect, createEvent, createStore, sample } from 'effector';

import { tokenManager } from 'shared/api';
import { appStarted } from 'shared/config/init';

import { authApi } from '../api';

/** The mock server's player id (dev only); real ids come from /auth/login. */
export const VIEWER_ID = '100';

const loginFx = createEffect(async () => {
  // Outside Telegram (plain browser) there is no initData: the server
  // decides (rejects, or a dev backend may accept it).
  const initData = window.Telegram?.WebApp?.initData ?? '';
  const session = await authApi.login(initData);

  tokenManager.setToken(session.accessToken ?? null);

  return session.user;
});

/** The signed-in player's id; null until login (or if it failed). */
export const $currentUserId = createStore<string | null>(null)
  .on(loginFx.doneData, (_, user) => user.id)
  .reset(loginFx.fail);

export const $authStatus = createStore<'pending' | 'ready' | 'failed'>(
  'pending'
)
  .on(loginFx.done, () => 'ready')
  .on(loginFx.fail, () => 'failed');

/** Resolves once the first login attempt has finished, either way. */
export const waitForAuth = () =>
  new Promise<void>(resolve => {
    if ($authStatus.getState() !== 'pending') {
      resolve();
      return;
    }

    const unsubscribe = $authStatus.watch(status => {
      if (status !== 'pending') {
        unsubscribe();
        resolve();
      }
    });
  });

sample({
  clock: appStarted,
  target: loginFx,
});

// A refresh failed (session gone): sign in again with Telegram's initData.
tokenManager.onSessionExpired(() => {
  void loginFx();
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
