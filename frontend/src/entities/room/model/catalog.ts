import type { RoomGame, RoomMode } from './types';

/** One table in the lobby, as GET /rooms returns it. */
export type RoomListItem = {
  id: number;
  /** Display name from the server ("Micro"), not translated. */
  name: string;
  mode: RoomMode;
  game?: RoomGame;
  /** "SB/BB" in TON. */
  blinds: string;
  players: number;
  max: number;
  /** Buy-in range in TON: 40–100 big blinds. */
  minBuy: number;
  maxBuy: number;
};

export const findRoom = (
  rooms: readonly RoomListItem[],
  roomId: string | number | null | undefined
) => rooms.find(room => String(room.id) === String(roomId)) ?? null;

/** "Heads-Up" / "6-Max" / "9-Max" style table format from seat count. */
export const roomFormat = (maxSeats: number) =>
  maxSeats <= 2 ? 'Heads-Up' : `${maxSeats}-Max`;

/** Big blind in TON from the "SB/BB" blinds string. */
export const roomBigBlind = (room: RoomListItem) =>
  Number(room.blinds.split('/')[1]) || 0;
