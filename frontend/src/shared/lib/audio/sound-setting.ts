import { createEvent, createStore } from 'effector';

import { readFlag, writeFlag } from 'shared/lib/storage';

const STORAGE_KEY = 'poker:sound';

export const setSoundEnabled = createEvent<boolean>();

export const $soundEnabled = createStore(readFlag(STORAGE_KEY, true)).on(
  setSoundEnabled,
  (_, enabled) => enabled
);

$soundEnabled.updates.watch(enabled => writeFlag(STORAGE_KEY, enabled));

export const isSoundEnabled = () => $soundEnabled.getState();
