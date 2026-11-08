import { normalizeNickname, validateNickname } from 'entities/session/lib';

const STORAGE_KEY = 'mock:nickname';
const DEFAULT_NICKNAME = 'You';

/** The mock player's nickname, kept across reloads like a real profile. */
export const getMockNickname = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_NICKNAME;
  } catch {
    return DEFAULT_NICKNAME;
  }
};

/** Validates like the backend would; returns the error code or the saved name. */
export const setMockNickname = (value: string) => {
  const error = validateNickname(value);

  if (error) {
    return { error } as const;
  }

  const nickname = normalizeNickname(value);

  try {
    localStorage.setItem(STORAGE_KEY, nickname);
  } catch {
    // Private mode: keep it for this session only.
  }

  return { nickname } as const;
};
