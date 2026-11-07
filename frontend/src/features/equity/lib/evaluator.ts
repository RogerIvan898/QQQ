/**
 * Cards are ints 0..51: rank * 4 + suit, rank 0 = deuce … 12 = ace.
 * `evaluate7` returns a score where higher is better and equal is a tie.
 */

const CATEGORY_SHIFT = 20;

const enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

/** Highest rank of a 5-card straight inside a rank bitmask, or -1. */
const straightHigh = (mask: number) => {
  // Ace also plays low (A-2-3-4-5): mirror bit 12 to a virtual bit -1.
  const extended = (mask << 1) | ((mask >> 12) & 1);

  for (let high = 12; high >= 3; high -= 1) {
    const run = 0b11111 << (high - 3);

    if ((extended & run) === run) {
      return high;
    }
  }

  return -1;
};

/**
 * Score = category in bits 20+, then five 4-bit rank slots, highest first.
 * Built without arrays: this runs millions of times per equity request.
 */
const withCategory = (category: Category, slots: number) =>
  (category << CATEGORY_SHIFT) | slots;

/** Appends one rank to the packed slots. */
const push = (slots: number, rank: number) => (slots << 4) | rank;

/**
 * Appends the top `limit` ranks of `mask` (skipping up to two ranks), then
 * pads so exactly five slots are used in total (`used` already taken).
 */
const pushTop = (
  slots: number,
  used: number,
  mask: number,
  limit: number,
  skip = -1,
  skip2 = -1
) => {
  let value = slots;
  let taken = 0;

  for (let rank = 12; rank >= 0 && taken < limit; rank -= 1) {
    if (mask & (1 << rank) && rank !== skip && rank !== skip2) {
      value = push(value, rank);
      taken += 1;
    }
  }

  return value << (4 * (5 - used - taken));
};

const rankCounts = new Uint8Array(13);
const suitMasks = new Uint16Array(4);
const suitCounts = new Uint8Array(4);

export const evaluate7 = (cards: ArrayLike<number>) => {
  rankCounts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);

  let rankMask = 0;

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const rank = card >> 2;
    const suit = card & 3;

    rankCounts[rank] += 1;
    suitMasks[suit] |= 1 << rank;
    suitCounts[suit] += 1;
    rankMask |= 1 << rank;
  }

  let flushMask = 0;

  for (let suit = 0; suit < 4; suit += 1) {
    if (suitCounts[suit] >= 5) {
      flushMask = suitMasks[suit];
    }
  }

  if (flushMask) {
    const high = straightHigh(flushMask);

    if (high >= 0) {
      return withCategory(Category.StraightFlush, push(0, high) << 16);
    }
  }

  let quads = -1;
  let trips = -1;
  let trips2 = -1;
  let pair = -1;
  let pair2 = -1;

  for (let rank = 12; rank >= 0; rank -= 1) {
    const count = rankCounts[rank];

    if (count === 4) {
      quads = rank;
    } else if (count === 3) {
      if (trips < 0) {
        trips = rank;
      } else if (trips2 < 0) {
        trips2 = rank;
      }
    } else if (count === 2) {
      if (pair < 0) {
        pair = rank;
      } else if (pair2 < 0) {
        pair2 = rank;
      }
    }
  }

  if (quads >= 0) {
    return withCategory(
      Category.Quads,
      pushTop(push(0, quads), 1, rankMask, 1, quads)
    );
  }

  if (trips >= 0 && (pair >= 0 || trips2 >= 0)) {
    return withCategory(
      Category.FullHouse,
      push(push(0, trips), Math.max(pair, trips2)) << 12
    );
  }

  if (flushMask) {
    return withCategory(Category.Flush, pushTop(0, 0, flushMask, 5));
  }

  const high = straightHigh(rankMask);

  if (high >= 0) {
    return withCategory(Category.Straight, push(0, high) << 16);
  }

  if (trips >= 0) {
    return withCategory(
      Category.Trips,
      pushTop(push(0, trips), 1, rankMask, 2, trips)
    );
  }

  if (pair >= 0 && pair2 >= 0) {
    return withCategory(
      Category.TwoPair,
      pushTop(push(push(0, pair), pair2), 2, rankMask, 1, pair, pair2)
    );
  }

  if (pair >= 0) {
    return withCategory(
      Category.Pair,
      pushTop(push(0, pair), 1, rankMask, 3, pair)
    );
  }

  return withCategory(Category.HighCard, pushTop(0, 0, rankMask, 5));
};
