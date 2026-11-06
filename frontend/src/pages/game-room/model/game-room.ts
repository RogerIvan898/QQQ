import { sample } from 'effector';
import { createGate } from 'effector-react';

import { gameModel } from 'entities/game';
import { setTonConnectPaused } from 'shared/lib/ton-connect';

export const GamePageGate = createGate();

sample({
  clock: GamePageGate.close,
  target: gameModel.disconnectGame,
});

// The wallet bridge connection is not needed during play.
GamePageGate.open.watch(() => setTonConnectPaused(true));
GamePageGate.close.watch(() => setTonConnectPaused(false));
