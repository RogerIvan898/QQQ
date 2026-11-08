import type { CardType as Card } from 'entities/card';

import type { PlayerAction, PlayerStatus, SeatBadgeKind } from './constants';

export type PlayerActionType = (typeof PlayerAction)[keyof typeof PlayerAction];

export type PlayerStatusType = (typeof PlayerStatus)[keyof typeof PlayerStatus];

export type SeatBadgeKindType =
  (typeof SeatBadgeKind)[keyof typeof SeatBadgeKind];

export type SeatActionBadge = PlayerActionType | SeatBadgeKindType;

export type BlindRole = 'sb' | 'bb';

export interface SeatDirection {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  stack: number;
  seat: number;
  status: PlayerStatusType;
  hand: [Card, Card] | null;
  committed: number;
  lastAction: PlayerActionType | null;
  lastActionAmount: number | null;
}
