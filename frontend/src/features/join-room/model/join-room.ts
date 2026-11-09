import { createEffect, createStore, sample } from 'effector';

import { gameModel } from 'entities/game';
import { roomApi } from 'entities/room';

export const joinRoomFx = createEffect(async (roomId: string) => {
  const data = await roomApi.join(roomId);

  return { roomId, ...data };
});

export const $joiningRoomId = createStore<string | null>(null)
  .on(joinRoomFx, (_, roomId) => roomId)
  .reset(joinRoomFx.finally);

export const $joinFailure = createStore<{
  roomId: string;
  count: number;
} | null>(null).on(joinRoomFx.fail, (last, { params }) => ({
  roomId: params,
  count: (last?.count ?? 0) + 1,
}));

sample({
  clock: joinRoomFx.doneData,
  fn: ({ wsUrl }) => ({ wsUrl }),
  target: gameModel.connectGame,
});
