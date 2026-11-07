import type { CardType as Card } from 'entities/card';

const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
const SUITS: Card['suit'][] = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Evaluator card id: rank * 4 + suit (see evaluator.ts). */
export const cardToInt = (card: Card) =>
  RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);
