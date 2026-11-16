import { createEffect, createEvent, createStore } from 'effector';

import { roomApi } from 'entities/room';

const isAllowedSocketUrl = (value: string) => {
  try {
    const { protocol } = new URL(value, window.location.href);

    return import.meta.env.PROD
      ? protocol === 'wss:'
      : protocol === 'wss:' || protocol === 'ws:';
  } catch {
    return false;
  }
};

export const joinRoomFx = createEffect(async (roomId: string) => {
  const data = await roomApi.join(roomId);

  if (!isAllowedSocketUrl(data.wsUrl)) {
    throw new Error('Unsafe game socket URL');
  }

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

export const prepareJoinedRoom =
  createEvent<Awaited<ReturnType<typeof joinRoomFx>>>();
const $joinedRoom = createStore<Awaited<ReturnType<typeof joinRoomFx>> | null>(
  null
).on(prepareJoinedRoom, (_, room) => room);

export const consumeJoinedRoom = () => {
  const room = $joinedRoom.getState();

  clearJoinedRoom();

  return room;
};

const clearJoinedRoom = createEvent();

$joinedRoom.reset(clearJoinedRoom);
