import { createEvent, merge, sample } from 'effector';

import { CLIENT_COMMANDS, gameModel } from 'entities/game';
import { PlayerAction } from 'entities/player';
import { sessionModel } from 'entities/session';

import type { RaisePayload } from './types';

export const fold = createEvent();
export const call = createEvent();
export const check = createEvent();
export const raise = createEvent<RaisePayload>();

const action = (type: string, amount?: number) => ({
  action: type,
  ...(typeof amount === 'number' && Number.isFinite(amount) ? { amount } : {}),
});

const simpleActionTriggered = merge([
  fold.map(() => action(PlayerAction.FOLD)),
  call.map(() => action(PlayerAction.CALL)),
  check.map(() => action(PlayerAction.CHECK)),
]);

const raiseActionTriggered = raise.map(({ amount }) =>
  action(PlayerAction.RAISE, amount)
);

const playerAction = merge([simpleActionTriggered, raiseActionTriggered]);

sample({
  clock: playerAction,
  source: sessionModel.$currentUserId,
  filter: (playerId): playerId is string => Boolean(playerId),
  fn: (playerId, payload) => ({
    type: CLIENT_COMMANDS.PLAYER_ACTION,
    payload: { playerId, payload },
  }),
  target: gameModel.sendClientCommand,
});
