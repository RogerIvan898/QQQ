import { Sound } from 'shared/assets/sounds';

import type { GameState } from './types';

export const INITIAL_GAME_STATE: GameState = {
  tableId: null,
  players: {},
  dealerSeat: null,
  activeSeat: null,
  round: 'IDLE',
  community: [],
  pot: 0,
  serverSeq: 0,
  bigBlind: 0,
  smallBlind: 0,
  smallBlindSeat: null,
  bigBlindSeat: null,
  minimumRaise: 0,
  currentBet: 0,
};

export const SERVER_EVENTS = {
  HAND_STARTED: 'EV_HAND_STARTED',
  PLAYER_SEATED: 'EV_PLAYER_SEATED',
  TURN_CHANGED: 'EV_TURN_CHANGED',
  STREET_CONCLUDED: 'EV_STREET_CONCLUDED',
  PLAYER_ACTED: 'EV_PLAYER_ACTED',
  YOUR_CARDS: 'EV_YOUR_CARDS',
  ALLOWED_ACTIONS: 'EV_ALLOWED_ACTIONS',
  BOARD_DEALT: 'EV_BOARD_DEALT',
  SHOWDOWN: 'EV_SHOWDOWN',
  HAND_COMPLETED: 'EV_HAND_COMPLETED',
  DEBUG_HOLES: 'EV_DEBUG_HOLES',
} as const;

export const CLIENT_COMMANDS = {
  PLAYER_ACTION: 'CMD_PLAYER_ACTION',
  REVEAL_HOLES: 'CMD_REVEAL_HOLES',
} as const;

export const GAME_SOUNDS = [
  Sound.CARD_DEAL,
  Sound.CARD_REVEAL,
  Sound.CHECK,
  Sound.CHIPS,
  Sound.TIME_BANK,
];
