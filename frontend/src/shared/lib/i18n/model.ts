import { createEffect, createEvent, createStore, sample } from 'effector';
import { createGate } from 'effector-react';

import type { Locale } from './constants';
import { activateLocale, detectLocale } from './locale';

export const I18nGate = createGate();

export const changeLocale = createEvent<Locale>();

const activateLocaleFx = createEffect(activateLocale);

export const $currentLocale = createStore<Locale | null>(null).on(
  activateLocaleFx.doneData,
  (_, locale) => locale
);

export const $isI18nReady = createStore(false).on(
  activateLocaleFx.doneData,
  () => true
);

let pendingLoad: Promise<void> | null = null;

export const waitForLocale = () => {
  if ($isI18nReady.getState()) {
    return Promise.resolve();
  }

  pendingLoad ??= new Promise(resolve => {
    const unsubscribe = $isI18nReady.watch(ready => {
      if (!ready) {
        return;
      }

      unsubscribe();
      pendingLoad = null;
      resolve();
    });
  });

  return pendingLoad;
};

/**
 * Loads the detected locale's catalog. Called before the first render so the
 * boot screen stays up until translations are ready (no loader hand-offs).
 */
export const prepareI18n = async () => {
  if ($isI18nReady.getState()) {
    return;
  }

  if (!activateLocaleFx.pending.getState()) {
    void activateLocaleFx(detectLocale()).catch(() => undefined);
  }

  await waitForLocale();
};

// Fallback if the app mounts before prepareI18n finished (or wasn't called).
sample({
  clock: I18nGate.open,
  filter: () =>
    !$isI18nReady.getState() && !activateLocaleFx.pending.getState(),
  fn: () => detectLocale(),
  target: activateLocaleFx,
});

sample({
  clock: changeLocale,
  target: activateLocaleFx,
});
