import { createEvent, createStore } from 'effector';

const STORAGE_KEY = 'poker:mock-server';

// On by default in development; production keeps it off unless explicitly
// enabled (there's no toggle UI there to turn it back off).
const DEFAULT_ENABLED = import.meta.env.DEV;

const readMockServerEnabled = (): boolean => {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY);

  if (stored === '1') return true;
  if (stored === '0') return false;

  return DEFAULT_ENABLED;
};

export const mockServerChanged = createEvent<boolean>();

export const $mockServerEnabled = createStore(readMockServerEnabled()).on(
  mockServerChanged,
  (_, enabled) => enabled
);

mockServerChanged.watch(enabled => {
  globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
});

export const setMockServerEnabled = async (enabled: boolean) => {
  // Constant-false in production, so the MSW chunk is tree-shaken away.
  if (!import.meta.env.DEV) return;

  const { applyMockServer } = await import('../../../mocks/runtime');

  await applyMockServer(enabled);
  mockServerChanged(enabled);
};

export const bootstrapMockServer = async () => {
  if (!import.meta.env.DEV) return;

  if (!readMockServerEnabled()) {
    return;
  }

  await setMockServerEnabled(true);
};
