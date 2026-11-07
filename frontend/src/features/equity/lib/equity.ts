import {
  addCard,
  createState,
  scoreWithHole,
  type HandState,
} from './evaluator';

/**
 * Enumerate every runout while it costs at most this many hand evaluations
 * (boards × players). Heads-up preflop (1.7M boards × 2) fits; 3-way preflop
 * does not and is sampled.
 */
export const EXACT_EVAL_LIMIT = 4_000_000;
/** Below this, exact is instant (flop/turn/river) and needs no quick preview. */
export const INSTANT_EVAL_LIMIT = 200_000;
export const SAMPLES = 40_000;

export type EquityMode = 'auto' | 'sample';

export interface EquityResult {
  equities: number[];
  /** `false` for a sampled (Monte Carlo) estimate, good to about ±0.5%. */
  exact: boolean;
}

const cardsRemaining = (dead: Set<number>) => {
  const deck: number[] = [];

  for (let card = 0; card < 52; card += 1) {
    if (!dead.has(card)) {
      deck.push(card);
    }
  }

  return deck;
};

export const choose = (n: number, k: number) => {
  let result = 1;

  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }

  return Math.round(result);
};

/**
 * FNV-1a over the spot's cards (hands in seat order, then the board): stays in
 * 32 bits for any table size, so every client derives the same seed and
 * therefore the same sampled numbers, and different spots get different seeds.
 */
const seedFor = (hands: number[][], board: number[]) => {
  let hash = 0x811c9dc5;

  for (const card of [...hands.flat(), 0xff, ...board]) {
    hash ^= card;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
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
export const computeEquity = (
  hands: number[][],
  board: number[],
  mode: EquityMode = 'auto'
): EquityResult => {
  const missing = 5 - board.length;
  const count = hands.length;
  const dead = new Set([...board, ...hands.flat()]);
  const deck = Uint8Array.from(cardsRemaining(dead));
  const wins = new Float64Array(count);
  const scores = new Int32Array(count);
  const holeA = Uint8Array.from(hands, hand => hand[0]);
  const holeB = Uint8Array.from(hands, hand => hand[1]);
  /** Ties split the pot: share for k winners, precomputed. */
  const share = Float64Array.from({ length: count + 1 }, (_, k) =>
    k ? 1 / k : 0
  );

  // states[d] = board plus the first d runout cards. The board is shared by
  // every player, so it is built once and each player only adds two cards.
  const states = Array.from({ length: missing + 1 }, createState);

  for (const card of board) {
    addCard(states[0], states[0], card);
  }

  const settle = (state: HandState) => {
    let best = -1;
    let winners = 0;

    for (let player = 0; player < count; player += 1) {
      const value = scoreWithHole(state, holeA[player], holeB[player]);

      scores[player] = value;

      if (value > best) {
        best = value;
        winners = 1;
      } else if (value === best) {
        winners += 1;
      }
    }

    const part = share[winners];

    for (let player = 0; player < count; player += 1) {
      if (scores[player] === best) {
        wins[player] += part;
      }
    }
  };

  let total = 0;
  let sampled = false;

  if (missing === 0) {
    settle(states[0]);
    total = 1;
  } else if (
    mode === 'auto' &&
    choose(deck.length, missing) * count <= EXACT_EVAL_LIMIT
  ) {
    // Every runout in lexicographic order, iteratively. Only the cards that
    // changed are re-added: moving the last index touches one state.
    const size = deck.length;
    const index = new Int32Array(missing);

    for (let depth = 0; depth < missing; depth += 1) {
      index[depth] = depth;
      addCard(states[depth], states[depth + 1], deck[depth]);
    }

    for (;;) {
      settle(states[missing]);
      total += 1;

      let depth = missing - 1;

      while (depth >= 0 && index[depth] === size - missing + depth) {
        depth -= 1;
      }

      if (depth < 0) {
        break;
      }

      index[depth] += 1;
      addCard(states[depth], states[depth + 1], deck[index[depth]]);

      for (let next = depth + 1; next < missing; next += 1) {
        index[next] = index[next - 1] + 1;
        addCard(states[next], states[next + 1], deck[index[next]]);
      }
    }
  } else {
    const random = prng(seedFor(hands, board));
    const pool = deck.slice();
    const last = states[missing];

    for (let sample = 0; sample < SAMPLES; sample += 1) {
      // Partial Fisher–Yates: the first `missing` slots become the runout.
      for (let slot = 0; slot < missing; slot += 1) {
        const pick = slot + Math.floor(random() * (pool.length - slot));
        const card = pool[pick];

        pool[pick] = pool[slot];
        pool[slot] = card;
        addCard(slot === 0 ? states[0] : last, last, card);
      }

      settle(last);
    }

    total = SAMPLES;
    sampled = true;
  }

  return {
    equities: Array.from(wins, value => value / total),
    exact: !sampled,
  };
};
