import { createEffect, createStore, sample } from 'effector';
import { createGate } from 'effector-react';

import { gameModel } from 'entities/game';
import { $rooms, findRoom } from 'entities/room';
import { sessionModel } from 'entities/session';
import { gameSessionsModel } from 'features/game-sessions';
import { handHistoryModel } from 'features/hand-history';
import { $joinedRoom, clearJoinedRoom, joinRoomFx } from 'features/join-room';
import { setTonConnectPaused } from 'shared/lib/ton-connect';

export const GamePageGate = createGate<{ roomId: string }>();

const $connectionGeneration = createStore(0).on(
  [GamePageGate.open, GamePageGate.close],
  generation => generation + 1
);

const roomOpened = sample({
  clock: GamePageGate.open,
  source: { prepared: $joinedRoom, generation: $connectionGeneration },
  fn: (connection, { roomId }) => ({ ...connection, roomId }),
});

type RoomEntry = {
  generation: number;
  roomId: string;
  prepared: Awaited<ReturnType<typeof joinRoomFx>> | null;
};

const waitForRoomAuthFx = createEffect(async (entry: RoomEntry) => {
  await sessionModel.waitForAuth();

  return entry;
});

const resolveRoomFx = createEffect(({ roomId, prepared }: RoomEntry) =>
  prepared?.roomId === roomId ? prepared : joinRoomFx(roomId)
);

sample({ clock: roomOpened, target: [waitForRoomAuthFx, clearJoinedRoom] });

const authenticationSettled = sample({
  clock: waitForRoomAuthFx.doneData,
  source: { generation: $connectionGeneration, auth: sessionModel.$authStatus },
  filter: ({ generation }, entry) => generation === entry.generation,
  fn: ({ auth }, entry) => ({ auth, entry }),
});

sample({
  clock: authenticationSettled,
  filter: ({ auth }) => auth === 'ready',
  fn: ({ entry }) => entry,
  target: resolveRoomFx,
});

const authFailed = sample({
  clock: authenticationSettled,
  filter: ({ auth }) => auth !== 'ready',
});

const roomJoined = sample({
  clock: resolveRoomFx.done,
  source: $connectionGeneration,
  filter: (generation, { params }) => generation === params.generation,
  fn: (_, { result }) => result,
});

const joinFailed = sample({
  clock: [resolveRoomFx.fail, waitForRoomAuthFx.fail],
  source: $connectionGeneration,
  filter: (generation, { params }) => generation === params.generation,
});

export const $connectionFailed = createStore(false)
  .on([authFailed, joinFailed], () => true)
  .reset(roomOpened, GamePageGate.close);

export const $connectionPending = createStore(false)
  .on(roomOpened, () => true)
  .reset(roomJoined, authFailed, joinFailed, GamePageGate.close);

sample({
  clock: roomJoined,
  source: $rooms,
  fn: (rooms, { roomId, wsUrl }) => ({
    wsUrl,
    game: findRoom(rooms, roomId)?.game,
  }),
  target: gameModel.connectGame,
});

sample({
  clock: roomJoined,
  fn: ({ roomId }) => roomId,
  target: [handHistoryModel.tableEntered, gameSessionsModel.sessionStarted],
});

sample({
  clock: GamePageGate.close,
  target: [
    gameSessionsModel.sessionEnded,
    gameModel.disconnectGame,
    handHistoryModel.tableLeft,
  ],
});

const setTonConnectPausedFx = createEffect(setTonConnectPaused);

sample({
  clock: GamePageGate.open,
  fn: () => true,
  target: setTonConnectPausedFx,
});
sample({
  clock: GamePageGate.close,
  fn: () => false,
  target: setTonConnectPausedFx,
});
