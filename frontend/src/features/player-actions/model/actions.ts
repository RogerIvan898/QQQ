import { createEvent, merge, sample } from 'effector';

import { CLIENT_COMMANDS, gameModel } from 'entities/game';
import { PlayerAction } from 'entities/player';

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

// No player id in the command: the server knows who is acting from the
// authenticated socket and must never trust an id sent by the client.
sample({
  clock: playerAction,
  fn: payload => ({
    type: CLIENT_COMMANDS.PLAYER_ACTION,
    payload,
  }),
  target: gameModel.sendClientCommand,
});
