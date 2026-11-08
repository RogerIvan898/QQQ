export type RoomMode = 'cash' | 'heads-up';

/** Poker variant played at the table. Only No-Limit Hold'em for now. */
export type RoomGame = 'nlh';

export interface RoomCardInfo {
  name: string;
  mode: RoomMode;
  /** Defaults to No-Limit Hold'em. */
  game?: RoomGame;
  blinds: string;
  players: number;
  max: number;
  minBuy: number;
  maxBuy: number;
}

export interface JoinRoomResponse {
  wsUrl: string;
  ticket?: string;
  expiresIn: number;
}
