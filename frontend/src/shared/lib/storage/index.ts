const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const readStorage = (key: string): string | null => {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) {
      store()?.removeItem(key);
    } else {
      store()?.setItem(key, value);
    }
  } catch {
    void 0;
  }
};

export const readJson = <T>(key: string, fallback: T): T => {
  const raw = readStorage(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown) => {
  writeStorage(key, value === null ? null : JSON.stringify(value));
};

export const readFlag = (key: string, fallback: boolean) => {
  const raw = readStorage(key);

  return raw === null ? fallback : raw === 'on';
};

export const writeFlag = (key: string, enabled: boolean) => {
  writeStorage(key, enabled ? 'on' : 'off');
};
