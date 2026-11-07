import { evaluate7 } from './evaluator';

/** Above this many remaining boards we sample instead of enumerating. */
export const EXACT_LIMIT = 50_000;
export const SAMPLES = 40_000;

const cardsRemaining = (dead: Set<number>) => {
  const deck: number[] = [];

  for (let card = 0; card < 52; card += 1) {
    if (!dead.has(card)) {
      deck.push(card);
    }
  }

  return deck;
};

const choose = (n: number, k: number) => {
  let result = 1;

  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }

  return Math.round(result);
};

/** Mulberry32: tiny seeded PRNG, so a given spot always gives the same %. */
const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Share of the pot each hand wins on average over the remaining board cards
 * (ties split). `hands` are two-card arrays, `board` 0–5 cards; returns
 * fractions summing to 1.
 */
export const computeEquity = (hands: number[][], board: number[]) => {
  const missing = 5 - board.length;
  const dead = new Set([...board, ...hands.flat()]);
  const deck = cardsRemaining(dead);
  const wins = new Float64Array(hands.length);
  const seven = hands.map(hand => {
    const cards = new Uint8Array(7);

    cards[0] = hand[0];
    cards[1] = hand[1];
    board.forEach((card, index) => {
      cards[2 + index] = card;
    });

    return cards;
  });
  const scores = new Int32Array(hands.length);

  const settle = (runout: ArrayLike<number>) => {
    let best = -1;
    let winners = 0;

    for (let player = 0; player < hands.length; player += 1) {
      const cards = seven[player];

      for (let index = 0; index < missing; index += 1) {
        cards[2 + board.length + index] = runout[index];
      }

      const value = evaluate7(cards);

      scores[player] = value;

      if (value > best) {
        best = value;
        winners = 1;
      } else if (value === best) {
        winners += 1;
      }
    }

    for (let player = 0; player < hands.length; player += 1) {
      if (scores[player] === best) {
        wins[player] += 1 / winners;
      }
    }
  };

  let total = 0;

  if (missing === 0) {
    settle([]);
    total = 1;
  } else if (choose(deck.length, missing) <= EXACT_LIMIT) {
    const runout = new Uint8Array(missing);
    const walk = (start: number, depth: number) => {
      if (depth === missing) {
        settle(runout);
        total += 1;
        return;
      }

      for (let index = start; index < deck.length; index += 1) {
        runout[depth] = deck[index];
        walk(index + 1, depth + 1);
      }
    };

    walk(0, 0);
  } else {
    const random = prng(
      hands.flat().reduce((seed, card) => seed * 53 + card, 7)
    );
    const pool = deck.slice();
    const runout = new Uint8Array(missing);

    for (let sample = 0; sample < SAMPLES; sample += 1) {
      // Partial Fisher–Yates: the first `missing` slots become the runout.
      for (let index = 0; index < missing; index += 1) {
        const pick = index + Math.floor(random() * (pool.length - index));
        const card = pool[pick];

        pool[pick] = pool[index];
        pool[index] = card;
        runout[index] = card;
      }

      settle(runout);
    }

    total = SAMPLES;
  }

  return Array.from(wins, value => value / total);
};
