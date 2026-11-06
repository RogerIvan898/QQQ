import type { CardRank, CardSuit } from './constants';

export type CardRank = (typeof CardRank)[keyof typeof CardRank];
export type CardSuit = (typeof CardSuit)[keyof typeof CardSuit];

export interface Card {
  rank: CardRank;
  suit: CardSuit;
}
