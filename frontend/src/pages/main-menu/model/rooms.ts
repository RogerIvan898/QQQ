import { msg } from '@lingui/core/macro';

import type { RoomListItem, RoomMode } from 'entities/room';
import {
  DEFAULT_GAME_VARIANT,
  type GameVariant,
} from 'shared/config/game-variant';

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

export const filterRooms = (
  rooms: readonly RoomListItem[],
  filter: RoomFilter,
  game: GameVariant
) =>
  rooms.filter(
    room =>
      (filter === 'all' || room.mode === filter) &&
      (room.game ?? DEFAULT_GAME_VARIANT) === game
  );
