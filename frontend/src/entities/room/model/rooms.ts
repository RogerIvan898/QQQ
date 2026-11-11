import { createEffect, createEvent, createStore, sample } from 'effector';

import { roomApi } from '../api';

import type { RoomListItem } from './catalog';

export const roomsRequested = createEvent();

export const fetchRoomsFx = createEffect(() => roomApi.list());

export const $rooms = createStore<RoomListItem[]>([]).on(
  fetchRoomsFx.doneData,
  (_, rooms) => rooms
);

export const $roomsStatus = createStore<
  'idle' | 'loading' | 'ready' | 'failed'
>('idle')
  .on(fetchRoomsFx, () => 'loading')
  .on(fetchRoomsFx.done, () => 'ready')
  .on(fetchRoomsFx.fail, status => (status === 'ready' ? 'ready' : 'failed'));

sample({
  clock: roomsRequested,
  filter: fetchRoomsFx.pending.map(pending => !pending),
  target: fetchRoomsFx,
});
