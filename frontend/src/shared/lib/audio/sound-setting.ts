import { createEvent, createStore } from 'effector';

const STORAGE_KEY = 'poker:sound';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setSoundEnabled = createEvent<boolean>();

export const $soundEnabled = createStore(readStored()).on(
  setSoundEnabled,
  (_, enabled) => enabled
);

$soundEnabled.updates.watch(enabled => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    void 0;
  }
});

export const isSoundEnabled = () => $soundEnabled.getState();
