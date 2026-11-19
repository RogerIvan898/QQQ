import { createEffect, createEvent, createStore, sample } from 'effector';

import type { Locale } from './constants';
import { activateLocale, detectLocale } from './locale';

export const changeLocale = createEvent<Locale>();

const activateLocaleFx = createEffect(activateLocale);

export const $currentLocale = createStore<Locale | null>(null).on(
  activateLocaleFx.doneData,
  (_, locale) => locale
);

export const prepareI18n = () => activateLocaleFx(detectLocale());

sample({
  clock: changeLocale,
  target: activateLocaleFx,
});
