export const CardSuit = {
  HEARTS: 'hearts',
  DIAMONDS: 'diamonds',
  CLUBS: 'clubs',
  SPADES: 'spades',
} as const;

export const CardRank = {
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  SIX: '6',
  SEVEN: '7',
  EIGHT: '8',
  NINE: '9',
  TEN: '10',
  JACK: 'J',
  QUEEN: 'Q',
  KING: 'K',
  ACE: 'A',
} as const;

/** Suit letter used by the server card notation, e.g. `"As"`. */
export const SUIT_BY_CODE = {
  h: CardSuit.HEARTS,
  d: CardSuit.DIAMONDS,
  c: CardSuit.CLUBS,
  s: CardSuit.SPADES,
} as const;

export const SUIT_SYMBOLS = {
  [CardSuit.HEARTS]: '♥',
  [CardSuit.DIAMONDS]: '♦',
  [CardSuit.CLUBS]: '♣',
  [CardSuit.SPADES]: '♠',
} as const;
