import { createEvent, createStore } from 'effector';

export const walletAccountChanged = createEvent<string | null>();

export const $walletAccountId = createStore<string | null>(null).on(
  walletAccountChanged,
  (_, userId) => userId
);
