import { msg } from '@lingui/core/macro';

import type { RoomListItem, RoomMode } from 'entities/room';

export { ROOMS } from 'entities/room';

export type RoomFilter = 'all' | RoomMode;

export const ROOM_FILTERS: RoomFilter[] = ['all', 'cash', 'heads-up'];

export const roomFilterLabel = (filter: RoomFilter) => {
  switch (filter) {
    case 'all':
      return msg`All`;
    case 'cash':
      return msg`Cash`;
    case 'heads-up':
      return msg`Heads-Up`;
  }
};

export const filterRooms = (rooms: RoomListItem[], filter: RoomFilter) =>
  filter === 'all' ? rooms : rooms.filter(room => room.mode === filter);
