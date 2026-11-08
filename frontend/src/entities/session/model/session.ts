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

/** The player's profile (nickname); loaded after login. */
const fetchProfileFx = createEffect(() => authApi.getMe());

export const saveNickname = createEvent<string>();
export const nicknameSaveReset = createEvent();

const saveNicknameFx = createEffect((nickname: string) =>
  authApi.updateNickname(nickname)
);

/** Null until the profile has loaded (fall back to the Telegram name). */
export const $nickname = createStore<string | null>(null)
  .on(fetchProfileFx.doneData, (_, profile) => profile?.nickname ?? null)
  .on(saveNicknameFx.doneData, (_, result) => result.nickname);

export const $nicknameSaving = saveNicknameFx.pending;

/** Last save result, for the form: saved, rejected by the server, or idle. */
export const $nicknameSaveStatus = createStore<'idle' | 'saved' | 'failed'>(
  'idle'
)
  .on(saveNicknameFx.done, () => 'saved')
  .on(saveNicknameFx.fail, () => 'failed')
  .on(saveNicknameFx, () => 'idle')
  .reset(nicknameSaveReset);

sample({
  clock: authFx.finally,
  target: fetchProfileFx,
});

sample({
  clock: saveNickname,
  target: saveNicknameFx,
});
