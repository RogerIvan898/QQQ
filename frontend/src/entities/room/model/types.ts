import type { GameVariant } from 'shared/config/game-variant';

export type RoomMode = 'cash' | 'heads-up';

export type RoomGame = GameVariant;

export interface RoomCardInfo {
  name: string;
  mode: RoomMode;

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
