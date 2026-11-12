import type { CardType as Card } from 'entities/card';

const RANK_INDEX: Record<Card['rank'], number> = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const SUIT_INDEX: Record<Card['suit'], number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

/** rank * 4 + suit, the layout the evaluator works with. */
export const cardToInt = (card: Card) =>
  RANK_INDEX[card.rank] * 4 + SUIT_INDEX[card.suit];
