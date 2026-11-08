/** Shared by the Settings form and the mock server (the backend mirrors it). */
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

/** Letters and digits in any script, plus space, dot, dash and underscore. */
const ALLOWED = /^[\p{L}\p{N} ._-]+$/u;

export type NicknameError = 'short' | 'long' | 'chars';

/** Trims and collapses runs of spaces: "  Ace   King " → "Ace King". */
export const normalizeNickname = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

export const validateNickname = (value: string): NicknameError | null => {
  const nickname = normalizeNickname(value);

  if (nickname.length < NICKNAME_MIN) {
    return 'short';
  }

  if (nickname.length > NICKNAME_MAX) {
    return 'long';
  }

  return ALLOWED.test(nickname) ? null : 'chars';
};
