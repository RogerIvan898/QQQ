import { msg } from '@lingui/core/macro';

import type { RoomListItem, RoomMode } from 'entities/room';

export type RoomFilter = 'all' | RoomMode | 'plo';

export const ROOM_FILTERS: RoomFilter[] = ['all', 'cash', 'heads-up', 'plo'];

export const roomFilterLabel = (filter: RoomFilter) => {
  switch (filter) {
    case 'all':
      return msg`All`;
    case 'cash':
      return msg`Cash`;
    case 'heads-up':
      return msg`Heads-Up`;
    case 'plo':
      return msg`Omaha`;
  }
};

export const filterRooms = (
  rooms: readonly RoomListItem[],
  filter: RoomFilter
) =>
  filter === 'all'
    ? rooms
    : filter === 'plo'
      ? rooms.filter(room => room.game === 'plo')
      : rooms.filter(room => room.mode === filter);
