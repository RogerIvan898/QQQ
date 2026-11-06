import { msg } from '@lingui/core/macro';

import type { RoomMode } from 'entities/room';

export type RoomListItem = {
  id: number;
  name: ReturnType<typeof msg>;
  mode: RoomMode;
  /** "SB/BB" in TON. */
  blinds: string;
  players: number;
  max: number;
  /** Buy-in range in TON: 40–100 big blinds. */
  minBuy: number;
  maxBuy: number;
};

// NLH cash grid, micro to VIP; every table buys in for 40–100 BB.
export const ROOMS: RoomListItem[] = [
  {
    id: 1,
    name: msg`Micro`,
    mode: 'cash',
    blinds: '0.01/0.02',
    players: 5,
    max: 9,
    minBuy: 0.8,
    maxBuy: 2,
  },
  {
    id: 2,
    name: msg`Micro+`,
    mode: 'cash',
    blinds: '0.02/0.05',
    players: 4,
    max: 6,
    minBuy: 2,
    maxBuy: 5,
  },
  {
    id: 3,
    name: msg`Low`,
    mode: 'cash',
    blinds: '0.05/0.10',
    players: 4,
    max: 6,
    minBuy: 4,
    maxBuy: 10,
  },
  {
    id: 4,
    name: msg`Low+`,
    mode: 'cash',
    blinds: '0.10/0.20',
    players: 4,
    max: 8,
    minBuy: 8,
    maxBuy: 20,
  },
  {
    id: 5,
    name: msg`Medium`,
    mode: 'cash',
    blinds: '0.25/0.50',
    players: 3,
    max: 6,
    minBuy: 20,
    maxBuy: 50,
  },
  {
    id: 6,
    name: msg`High`,
    mode: 'cash',
    blinds: '0.50/1',
    players: 4,
    max: 8,
    minBuy: 40,
    maxBuy: 100,
  },
  {
    id: 7,
    name: msg`VIP`,
    mode: 'cash',
    blinds: '1/2',
    players: 1,
    max: 9,
    minBuy: 80,
    maxBuy: 200,
  },
  {
    id: 8,
    name: msg`HU Classic`,
    mode: 'heads-up',
    blinds: '0.10/0.20',
    players: 1,
    max: 2,
    minBuy: 8,
    maxBuy: 20,
  },
  {
    id: 9,
    name: msg`HU High Roller`,
    mode: 'heads-up',
    blinds: '5/10',
    players: 2,
    max: 2,
    minBuy: 400,
    maxBuy: 1000,
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
