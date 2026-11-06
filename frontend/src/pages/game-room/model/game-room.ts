import { sample } from 'effector';
import { createGate } from 'effector-react';

import { gameModel } from 'entities/game';

export const GamePageGate = createGate();

sample({
  clock: GamePageGate.close,
  target: gameModel.disconnectGame,
});
