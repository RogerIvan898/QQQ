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

const localeReady = new Promise<void>(resolve => {
  const unsubscribe = $isI18nReady.updates.watch(ready => {
    if (ready) {
      unsubscribe();
      resolve();
    }
  });
});

const localePreparationRequested = createEvent();

export const waitForLocale = () => localeReady;

export const prepareI18n = () => {
  localePreparationRequested();

  return waitForLocale();
};

sample({
  clock: [I18nGate.open, localePreparationRequested],
  source: { ready: $isI18nReady, pending: activateLocaleFx.pending },
  filter: ({ ready, pending }) => !ready && !pending,
  fn: () => detectLocale(),
  target: activateLocaleFx,
});

sample({
  clock: changeLocale,
  target: activateLocaleFx,
});
