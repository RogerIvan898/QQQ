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

// sessionStorage: переживает перезагрузку страницы, но не закрытие вкладки или WebView.
const sessionStore = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

export const readSessionJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = sessionStore()?.getItem(key);

    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeSessionJson = (key: string, value: unknown) => {
  try {
    if (value === null) {
      sessionStore()?.removeItem(key);
    } else {
      sessionStore()?.setItem(key, JSON.stringify(value));
    }
  } catch {
    void 0;
  }
};

// Удаляет из localStorage все ключи с данным префиксом.
export const removeStorageByPrefix = (prefix: string) => {
  try {
    const local = store();

    if (!local) {
      return;
    }

    const keys: string[] = [];

    for (let index = 0; index < local.length; index += 1) {
      const key = local.key(index);

      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    keys.forEach(key => local.removeItem(key));
  } catch {
    void 0;
  }
};
