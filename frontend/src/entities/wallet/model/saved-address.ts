import { createEvent, createStore, sample } from 'effector';

import { sessionModel } from 'entities/session';
import { readStorage, writeStorage } from 'shared/lib/storage';

const STORAGE_KEY = 'poker:withdraw-address';

export const withdrawAddressSaved = createEvent<string>();

const addressLoaded = createEvent<string | null>();
export const $savedWithdrawAddress = createStore<string | null>(null).on(
  addressLoaded,
  (_, address) => address
);

sessionModel.$currentUserId.watch(userId => {
  addressLoaded(userId ? readStorage(`${STORAGE_KEY}:${userId}`) : null);
});

sample({
  clock: withdrawAddressSaved,
  source: sessionModel.$currentUserId,
  fn: (userId, value) => ({ userId, value }),
}).watch(({ userId, value }) => {
  if (!userId) return;

  const address = value.trim() || null;
  writeStorage(`${STORAGE_KEY}:${userId}`, address);
  addressLoaded(address);
});
