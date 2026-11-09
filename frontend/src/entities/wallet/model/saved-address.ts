import { createEvent, createStore } from 'effector';

import { readStorage, writeStorage } from 'shared/lib/storage';

const STORAGE_KEY = 'poker:withdraw-address';

export const withdrawAddressSaved = createEvent<string>();

export const $savedWithdrawAddress = createStore<string | null>(
  readStorage(STORAGE_KEY) || null
).on(withdrawAddressSaved, (_, address) => address.trim() || null);

$savedWithdrawAddress.updates.watch(address => {
  writeStorage(STORAGE_KEY, address);
});
