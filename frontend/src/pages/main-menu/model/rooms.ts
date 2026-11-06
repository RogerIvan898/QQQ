import { msg } from '@lingui/core/macro';

import type { RoomMode } from 'entities/room';

export type RoomListItem = {
  id: number;
  name: ReturnType<typeof msg>;
  mode: RoomMode;
  blinds: string;
  players: number;
  max: number;
  minBuy: string;
};

export const ROOMS: RoomListItem[] = [
  {
    id: 1,
    name: msg`Texas Hold’em`,
    mode: 'cash',
    blinds: '0.1/0.2',
    players: 6,
    max: 8,
    minBuy: '10 TON',
  },
  {
    id: 2,
    name: msg`Mid Stakes`,
    mode: 'cash',
    blinds: '1/2',
    players: 5,
    max: 8,
    minBuy: '50 TON',
  },
  {
    id: 4,
    name: msg`Beginners`,
    mode: 'cash',
    blinds: '0.05/0.1',
    players: 4,
    max: 6,
    minBuy: '2 TON',
  },
  {
    id: 5,
    name: msg`Deepstack Pro`,
    mode: 'cash',
    blinds: '2/4',
    players: 3,
    max: 8,
    minBuy: '100 TON',
  },
  {
    id: 3,
    name: msg`HU Classic`,
    mode: 'heads-up',
    blinds: '0.1/0.2',
    players: 1,
    max: 2,
    minBuy: '5 TON',
  },
  {
    id: 6,
    name: msg`HU High Roller`,
    mode: 'heads-up',
    blinds: '5/10',
    players: 2,
    max: 2,
    minBuy: '250 TON',
  },
];

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
