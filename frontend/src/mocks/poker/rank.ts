const RANK_VALUE: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const CATEGORY_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

interface ParsedCard {
  rank: number;
  suit: string;
}

const CATEGORY_BASE = 15 ** 5;

const parseCard = (card: string): ParsedCard => {
  const suit = card.slice(-1);
  const rank = RANK_VALUE[card.slice(0, -1)];

  if (!suit || rank === undefined) {
    throw new Error(`Invalid card: ${card}`);
  }

  return { rank, suit };
};

const pack = (category: number, kickers: number[]): number => {
  const padded = [...kickers, 0, 0, 0, 0, 0].slice(0, 5);

  return padded.reduce(
    (total, kicker, index) => total + kicker * 15 ** (4 - index),
    category * CATEGORY_BASE
  );
};

const straightHigh = (ranks: number[]): number | null => {
  const unique = [...new Set(ranks)].sort((left, right) => right - left);
  const ladder = unique.includes(14) ? [...unique, 1] : unique;

  for (let index = 0; index <= ladder.length - 5; index += 1) {
    const window = ladder.slice(index, index + 5);
    const high = window[0];
    const low = window[4];

    if (high === undefined || low === undefined) {
      continue;
    }

    if (high - low === 4 && new Set(window).size === 5) {
      return high === 14 && low === 1 ? 5 : high;
    }
  }

  return null;
};

const scoreFive = (cards: ParsedCard[]): number => {
  const ranks = cards
    .map(card => card.rank)
    .sort((left, right) => right - left);
  const flush = cards.every(card => card.suit === cards[0]?.suit);
  const straight = straightHigh(ranks);
  const counts = new Map<number, number>();

  ranks.forEach(rank => {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  });

  const groups = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0]
  );
  const [primary, secondary] = groups;

  if (flush && straight !== null) {
    return pack(8, [straight]);
  }

  if (primary?.[1] === 4) {
    const kicker = groups.find(group => group[1] === 1)?.[0] ?? 0;

    return pack(7, [primary[0], kicker]);
  }

  if (primary?.[1] === 3 && secondary?.[1] === 2) {
    return pack(6, [primary[0], secondary[0]]);
  }

  if (flush) {
    return pack(5, ranks);
  }

  if (straight !== null) {
    return pack(4, [straight]);
  }

  if (primary?.[1] === 3) {
    const kickers = groups
      .filter(group => group[1] === 1)
      .map(group => group[0]);

    return pack(3, [primary[0], ...kickers]);
  }

  if (primary?.[1] === 2 && secondary?.[1] === 2) {
    const kicker = groups.find(group => group[1] === 1)?.[0] ?? 0;

    return pack(2, [primary[0], secondary[0], kicker]);
  }

  if (primary?.[1] === 2) {
    const kickers = groups
      .filter(group => group[1] === 1)
      .map(group => group[0]);

    return pack(1, [primary[0], ...kickers]);
  }

  return pack(0, ranks);
};

const combinations = <T>(items: readonly T[], size: number): T[][] => {
  if (size === 0) {
    return [[]];
  }

  if (items.length < size) {
    return [];
  }

  const [head, ...tail] = items;

  if (head === undefined) {
    return [];
  }

  return [
    ...combinations(tail, size - 1).map(rest => [head, ...rest]),
    ...combinations(tail, size),
  ];
};

export const rankHand = (cards: readonly string[]) => {
  const parsed = cards.map(parseCard);
  const best = combinations(parsed, 5).reduce(
    (winner, five) => Math.max(winner, scoreFive(five)),
    0
  );
  const category = Math.floor(best / CATEGORY_BASE);

  return {
    score: best,
    name: CATEGORY_NAMES[category] ?? 'High card',
  };
};
