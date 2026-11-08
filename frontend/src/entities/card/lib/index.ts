import { SUIT_BY_CODE, type Card } from '../model';

export const parseCard = (cardString: string): Card => ({
  rank: cardString.slice(0, -1) as Card['rank'],
  suit: SUIT_BY_CODE[cardString.slice(-1) as keyof typeof SUIT_BY_CODE],
});
