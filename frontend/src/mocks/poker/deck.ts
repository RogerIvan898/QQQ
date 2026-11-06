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
] as const;

const SUITS = ['h', 'd', 'c', 's'] as const;

export const createShuffledDeck = (): string[] => {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => `${rank}${suit}`));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = deck[index];
    const next = deck[swap];

    if (current === undefined || next === undefined) {
      continue;
    }

    deck[index] = next;
    deck[swap] = current;
  }

  return deck;
};
