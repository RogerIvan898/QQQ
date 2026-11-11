import { NICKNAME_KEY } from 'entities/session/model';

const DEFAULT_NICKNAME = 'You';

export const getMockNickname = () => {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? DEFAULT_NICKNAME;
  } catch {
    return DEFAULT_NICKNAME;
  }
};
