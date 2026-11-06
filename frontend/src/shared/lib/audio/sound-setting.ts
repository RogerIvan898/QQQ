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

/** Whether game sounds play. Persisted per device; on by default. */
export const $soundEnabled = createStore(readStored()).on(
  setSoundEnabled,
  (_, enabled) => enabled
);

$soundEnabled.updates.watch(enabled => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode); the setting just won't persist.
  }
});

export const isSoundEnabled = () => $soundEnabled.getState();
