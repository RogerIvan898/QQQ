export const PlayerAction = {
  BET: 'BET',
  RAISE: 'RAISE',
  CALL: 'CALL',
  CHECK: 'CHECK',
  FOLD: 'FOLD',
} as const;

export const PlayerStatus = {
  SITTING_OUT: 'SITTING_OUT',
  WAITING: 'WAITING',
  IN_GAME: 'IN_GAME',
  FOLDED: 'FOLDED',
  RAISE: 'RAISE',
  ALL_IN: 'ALL_IN',
} as const;

export const SeatBadgeKind = {
  ALL_IN: 'ALL_IN',
  SB: 'SB',
  BB: 'BB',
  SIT_OUT: 'SIT_OUT',

  WIN: 'WIN',
} as const;
