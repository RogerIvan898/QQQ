import { createEffect, createEvent, createStore, sample } from 'effector';

import { roomApi } from '../api';

import type { RoomListItem } from './catalog';

export const roomsRequested = createEvent();

export const fetchRoomsFx = createEffect(() => roomApi.list());

/** The lobby: every table the server offers. */
export const $rooms = createStore<RoomListItem[]>([]).on(
  fetchRoomsFx.doneData,
  (_, rooms) => rooms
);

/** For the menu: show a loader, the list, or an error with Retry. */
export const $roomsStatus = createStore<
  'idle' | 'loading' | 'ready' | 'failed'
>('idle')
  .on(fetchRoomsFx, () => 'loading')
  .on(fetchRoomsFx.done, () => 'ready')
  .on(fetchRoomsFx.fail, status =>
    // Keep showing the last list if a refresh fails.
    status === 'ready' ? 'ready' : 'failed'
  );

// Pages ask (the menu on every visit, for fresh seat counts): by then the
// player is signed in, in case the list needs auth.
sample({
  clock: roomsRequested,
  filter: fetchRoomsFx.pending.map(pending => !pending),
  target: fetchRoomsFx,
});
