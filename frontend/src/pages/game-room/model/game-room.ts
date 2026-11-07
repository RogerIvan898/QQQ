import { sample } from 'effector';
import { createGate } from 'effector-react';

import { gameModel } from 'entities/game';
import { gameSessionsModel } from 'features/game-sessions';
import { handHistoryModel } from 'features/hand-history';
import { setTonConnectPaused } from 'shared/lib/ton-connect';

export const GamePageGate = createGate<{ roomId: string }>();

sample({
  clock: GamePageGate.open,
  fn: ({ roomId }) => roomId,
  target: handHistoryModel.tableEntered,
});

sample({
  clock: GamePageGate.open,
  fn: ({ roomId }) => roomId,
  target: gameSessionsModel.sessionStarted,
});

sample({
  clock: GamePageGate.close,
  target: [gameSessionsModel.sessionEnded, gameModel.disconnectGame],
});

// The wallet bridge connection is not needed during play.
GamePageGate.open.watch(() => setTonConnectPaused(true));
GamePageGate.close.watch(() => setTonConnectPaused(false));
