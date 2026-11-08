import { createEvent, createStore } from 'effector';

const STORAGE_KEY = 'poker:withdraw-address';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

export const withdrawAddressSaved = createEvent<string>();

export const $savedWithdrawAddress = createStore<string | null>(
  readStored()
).on(withdrawAddressSaved, (_, address) => address.trim() || null);

$savedWithdrawAddress.updates.watch(address => {
  try {
    if (address) {
      localStorage.setItem(STORAGE_KEY, address);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    void 0;
  }
});
