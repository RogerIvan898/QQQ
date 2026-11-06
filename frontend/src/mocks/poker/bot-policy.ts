import { PlayerAction } from 'entities/player';

import type { ChosenAction } from './commands';

export const chooseBotAction = ({
  need,
  stack,
  committed,
  bigBlind,
  roll,
}: {
  need: number;
  stack: number;
  committed: number;
  bigBlind: number;
  roll: number;
}): ChosenAction => {
  if (need === 0) {
    if (roll > 0.78 && stack >= bigBlind) {
      return {
        action: PlayerAction.BET,
        amount: committed + bigBlind * (roll > 0.92 ? 3 : 1),
      };
    }

    return { action: PlayerAction.CHECK };
  }

  if (need > stack * 0.65 && roll > 0.4) {
    return { action: PlayerAction.FOLD };
  }

  if (roll > 0.84 && stack > need + bigBlind) {
    return {
      action: PlayerAction.RAISE,
      amount: committed + need + bigBlind * 2,
    };
  }

  return { action: PlayerAction.CALL };
};
