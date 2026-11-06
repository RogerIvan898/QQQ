import { SUIT_BY_CODE, SUIT_SYMBOLS, type Card } from '../model';

/** Parses server notation such as `"10h"` or `"As"`. */
export const parseCard = (cardString: string): Card => ({
  rank: cardString.slice(0, -1) as Card['rank'],
  suit: SUIT_BY_CODE[cardString.slice(-1) as keyof typeof SUIT_BY_CODE],
});

export const getSuitSymbol = (suit: Card['suit'] | undefined) =>
  suit ? SUIT_SYMBOLS[suit] : '';
