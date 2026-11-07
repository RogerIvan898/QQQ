/**
 * Cards are ints 0..51: rank * 4 + suit, rank 0 = deuce … 12 = ace.
 * Scores: higher is better, equal is a tie. Layout: category << 20, then five
 * 4-bit rank slots, highest first.
 *
 * Hot path, so it works on bitmasks only (no arrays, no allocation):
 * - `m0..m3`: ranks present per suit (13-bit masks),
 * - `n1..n4`: bit-sliced rank counts — bit r of n2 set = rank r seen ≥ 2 times.
 * A hand "state" is those eight ints; adding a card is a few bit operations,
 * so the shared board is built once and each player only adds two cards.
 */

const CATEGORY_SHIFT = 20;

const HIGH_CARD = 0;
const PAIR = 1;
const TWO_PAIR = 2;
const TRIPS = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const QUADS = 7;
const STRAIGHT_FLUSH = 8;

/** Popcount of every 13-bit mask. */
const POP = new Uint8Array(8192);
/** Highest rank of a straight inside a 13-bit mask, or -1 (wheel included). */
const STRAIGHT_HIGH = new Int8Array(8192);

for (let mask = 0; mask < 8192; mask += 1) {
  POP[mask] = (mask & 1) + POP[mask >> 1];

  const extended = (mask << 1) | ((mask >> 12) & 1);
  let high = -1;

  for (let top = 12; top >= 3; top -= 1) {
    const run = 0b11111 << (top - 3);

    if ((extended & run) === run) {
      high = top;
      break;
    }
  }

  STRAIGHT_HIGH[mask] = high;
}

/** Highest set bit of a non-zero mask. */
const hi = (mask: number) => 31 - Math.clz32(mask);

/**
 * Packs the top `count` ranks of `mask` after `slots` (which already holds
 * `used` ranks), padding to five slots.
 */
const packTop = (slots: number, used: number, mask: number, count: number) => {
  let value = slots;
  let rest = mask;
  let taken = 0;

  while (taken < count && rest !== 0) {
    const rank = hi(rest);

    value = (value << 4) | rank;
    rest ^= 1 << rank;
    taken += 1;
  }

  return value << (4 * (5 - used - taken));
};

/** Scores a complete hand state (5–7 cards). */
export const scoreState = (
  m0: number,
  m1: number,
  m2: number,
  m3: number,
  n1: number,
  n2: number,
  n3: number,
  n4: number
) => {
  const flush =
    POP[m0] >= 5
      ? m0
      : POP[m1] >= 5
        ? m1
        : POP[m2] >= 5
          ? m2
          : POP[m3] >= 5
            ? m3
            : 0;

  if (flush !== 0) {
    const high = STRAIGHT_HIGH[flush];

    if (high >= 0) {
      return (STRAIGHT_FLUSH << CATEGORY_SHIFT) | (high << 16);
    }
  }

  if (n4 !== 0) {
    const quads = hi(n4);

    return (QUADS << CATEGORY_SHIFT) | packTop(quads, 1, n1 & ~(1 << quads), 1);
  }

  const trips = n3 & ~n4;
  const pairs = n2 & ~n3;

  if (trips !== 0) {
    const top = hi(trips);
    const rest = (trips & ~(1 << top)) | pairs;

    if (rest !== 0) {
      return (FULL_HOUSE << CATEGORY_SHIFT) | (((top << 4) | hi(rest)) << 12);
    }
  }

  if (flush !== 0) {
    return (FLUSH << CATEGORY_SHIFT) | packTop(0, 0, flush, 5);
  }

  const high = STRAIGHT_HIGH[n1];

  if (high >= 0) {
    return (STRAIGHT << CATEGORY_SHIFT) | (high << 16);
  }

  if (trips !== 0) {
    const top = hi(trips);

    return (TRIPS << CATEGORY_SHIFT) | packTop(top, 1, n1 & ~(1 << top), 2);
  }

  if (pairs !== 0) {
    const first = hi(pairs);
    const others = pairs & ~(1 << first);

    if (others !== 0) {
      const second = hi(others);

      return (
        (TWO_PAIR << CATEGORY_SHIFT) |
        packTop(
          (first << 4) | second,
          2,
          n1 & ~((1 << first) | (1 << second)),
          1
        )
      );
    }

    return (PAIR << CATEGORY_SHIFT) | packTop(first, 1, n1 & ~(1 << first), 3);
  }

  return (HIGH_CARD << CATEGORY_SHIFT) | packTop(0, 0, n1, 5);
};

/** Hand state: [m0, m1, m2, m3, n1, n2, n3, n4]. */
export type HandState = Int32Array;

export const createState = (): HandState => new Int32Array(8);

/** `into` = `from` plus one card (both may be the same array). */
export const addCard = (from: HandState, into: HandState, card: number) => {
  const bit = 1 << (card >> 2);
  const n1 = from[4];
  const n2 = from[5];
  const n3 = from[6];

  into[0] = from[0];
  into[1] = from[1];
  into[2] = from[2];
  into[3] = from[3];
  into[card & 3] |= bit;
  into[7] = from[7] | (n3 & bit);
  into[6] = n3 | (n2 & bit);
  into[5] = n2 | (n1 & bit);
  into[4] = n1 | bit;
};

/** Scores `board` plus two hole cards without touching `board`. */
export const scoreWithHole = (board: HandState, a: number, b: number) => {
  let m0 = board[0];
  let m1 = board[1];
  let m2 = board[2];
  let m3 = board[3];
  let n1 = board[4];
  let n2 = board[5];
  let n3 = board[6];
  let n4 = board[7];

  // Inlined addCard ×2: this runs millions of times per request.
  let bit = 1 << (a >> 2);
  let suit = a & 3;

  if (suit === 0) m0 |= bit;
  else if (suit === 1) m1 |= bit;
  else if (suit === 2) m2 |= bit;
  else m3 |= bit;
  n4 |= n3 & bit;
  n3 |= n2 & bit;
  n2 |= n1 & bit;
  n1 |= bit;

  bit = 1 << (b >> 2);
  suit = b & 3;

  if (suit === 0) m0 |= bit;
  else if (suit === 1) m1 |= bit;
  else if (suit === 2) m2 |= bit;
  else m3 |= bit;
  n4 |= n3 & bit;
  n3 |= n2 & bit;
  n2 |= n1 & bit;
  n1 |= bit;

  return scoreState(m0, m1, m2, m3, n1, n2, n3, n4);
};

const scratch = createState();

/** Scores 5–7 cards. */
export const evaluate7 = (cards: ArrayLike<number>) => {
  scratch.fill(0);

  for (let index = 0; index < cards.length; index += 1) {
    addCard(scratch, scratch, cards[index]);
  }

  return scoreState(
    scratch[0],
    scratch[1],
    scratch[2],
    scratch[3],
    scratch[4],
    scratch[5],
    scratch[6],
    scratch[7]
  );
};
