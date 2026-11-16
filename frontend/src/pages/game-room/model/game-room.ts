import { createEvent, createStore, sample } from 'effector';
import { createGate } from 'effector-react';

import { gameModel } from 'entities/game';
import { $rooms, findRoom } from 'entities/room';
import { sessionModel } from 'entities/session';
import { gameSessionsModel } from 'features/game-sessions';
import { handHistoryModel } from 'features/hand-history';
import {
  consumeJoinedRoom,
  joinRoomFx,
} from 'features/join-room/model/join-room';
import { setTonConnectPaused } from 'shared/lib/ton-connect';

export const GamePageGate = createGate<{ roomId: string }>();

const connectionFailed = createEvent();
const connectionStarted = createEvent();
export const $connectionFailed = createStore(false)
  .on(connectionFailed, () => true)
  .reset(connectionStarted, GamePageGate.close);
const connectionReady = createEvent();
export const $connectionPending = createStore(false)
  .on(connectionStarted, () => true)
  .reset(connectionReady, connectionFailed, GamePageGate.close);

let connectionGeneration = 0;
GamePageGate.close.watch(() => {
  connectionGeneration += 1;
});
GamePageGate.open.watch(async ({ roomId }) => {
  const generation = ++connectionGeneration;
  connectionStarted();
  const prepared = consumeJoinedRoom();
  try {
    await sessionModel.waitForAuth();
    if (generation !== connectionGeneration) return;
    const room =
      prepared?.roomId === roomId ? prepared : await joinRoomFx(roomId);
    if (generation !== connectionGeneration) return;
    gameModel.connectGame({
      wsUrl: room.wsUrl,
      game: findRoom($rooms.getState(), roomId)?.game,
    });
    connectionReady();
  } catch {
    if (generation === connectionGeneration) connectionFailed();
  }
});

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
  target: [
    gameSessionsModel.sessionEnded,
    gameModel.disconnectGame,
    handHistoryModel.tableLeft,
  ],
});

GamePageGate.open.watch(() => setTonConnectPaused(true));
GamePageGate.close.watch(() => setTonConnectPaused(false));
