import type { CardType as Card } from 'entities/card';
import type { GameStreet } from 'entities/game';
import type { PlayerActionType } from 'entities/player';

export interface HandAction {
  street: GameStreet;
  seat: number;
  name: string;
  action: PlayerActionType | 'SB' | 'BB';
  /** Chips put in by this action, when any. */
  amount: number | null;
  isMe: boolean;
}

export interface HandWinner {
  seat: number;
  name: string;
  amount: number;
  combination: string;
  isMe: boolean;
}

export interface HandSeat {
  seat: number;
  name: string;
  isMe: boolean;
  /** Stack at the start of the hand, before blinds. */
  stack: number;
  /** Hole cards, when known (ours, or revealed at showdown). */
  cards: Card[] | null;
}

export interface HandRecord {
  id: string;
  roomId: string | null;
  startedAt: string;
  finishedAt: string;
  smallBlind: number;
  bigBlind: number;
  /** Button and blind seats; missing on hands recorded before they were kept. */
  dealerSeat?: number | null;
  smallBlindSeat?: number | null;
  bigBlindSeat?: number | null;
  myCards: Card[] | null;
  board: Card[];
  seats: HandSeat[];
  actions: HandAction[];
  winners: HandWinner[];
  /** Our stack change over the hand, in chips (negative = lost). */
  net: number;
  pot: number;
}
