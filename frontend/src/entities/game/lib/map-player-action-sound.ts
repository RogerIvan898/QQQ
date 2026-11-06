import {
  PlayerAction,
  PlayerStatus,
  type PlayerActionType,
  type PlayerStatusType,
} from 'entities/player';

import type { PokerSoundAction } from './types';

const ACTION_SOUNDS: Record<PlayerActionType, PokerSoundAction> = {
  [PlayerAction.FOLD]: 'fold',
  [PlayerAction.CHECK]: 'check',
  [PlayerAction.CALL]: 'call',
  [PlayerAction.BET]: 'bet',
  [PlayerAction.RAISE]: 'bet',
};

export const getPlayerActionSound = (
  action: PlayerActionType,
  status: PlayerStatusType
): PokerSoundAction =>
  status === PlayerStatus.ALL_IN ? 'allin' : ACTION_SOUNDS[action];
