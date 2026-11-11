import { createEvent, createStore } from 'effector';

import { MOCK_SERVER_AVAILABLE } from 'shared/config/mock';
import { readStorage, writeStorage } from 'shared/lib/storage';

const STORAGE_KEY = 'poker:mock-server';

const DEFAULT_ENABLED = MOCK_SERVER_AVAILABLE;

const readMockServerEnabled = (): boolean => {
  const stored = readStorage(STORAGE_KEY);

  if (stored === '1') return true;
  if (stored === '0') return false;

  return DEFAULT_ENABLED;
};

const mockServerChanged = createEvent<boolean>();

export const $mockServerEnabled = createStore(readMockServerEnabled()).on(
  mockServerChanged,
  (_, enabled) => enabled
);

mockServerChanged.watch(enabled => {
  writeStorage(STORAGE_KEY, enabled ? '1' : '0');
});

export const setMockServerEnabled = async (enabled: boolean) => {
  if (!MOCK_SERVER_AVAILABLE) return;

  const { applyMockServer } = await import('../../../mocks/runtime');

  await applyMockServer(enabled);
  mockServerChanged(enabled);
};

export const bootstrapMockServer = async () => {
  if (!MOCK_SERVER_AVAILABLE) return;

  if (!readMockServerEnabled()) {
    return;
  }

  await setMockServerEnabled(true);
};
