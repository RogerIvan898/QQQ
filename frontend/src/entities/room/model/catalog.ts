import type { RoomGame, RoomMode } from './types';

export type RoomListItem = {
  id: number;

  name: string;
  mode: RoomMode;
  game?: RoomGame;

  blinds: string;
  players: number;
  max: number;

  minBuy: number;
  maxBuy: number;
};

export const findRoom = (
  rooms: readonly RoomListItem[],
  roomId: string | number | null | undefined
) => rooms.find(room => String(room.id) === String(roomId)) ?? null;

export const roomFormat = (maxSeats: number) =>
  maxSeats <= 2 ? 'Heads-Up' : `${maxSeats}-Max`;

export const roomBigBlind = (room: RoomListItem) =>
  Number(room.blinds.split('/')[1]) || 0;

export type RoomTier = 'micro' | 'low' | 'mid' | 'high';

export const roomTier = (bigBlind: number): RoomTier =>
  bigBlind < 0.1
    ? 'micro'
    : bigBlind < 0.5
      ? 'low'
      : bigBlind < 2
        ? 'mid'
        : 'high';
