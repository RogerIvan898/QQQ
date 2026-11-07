import {
  addCardToState,
  createHandState,
  scoreBoardWithHoleCards,
  type HandState,
} from './evaluator';

/**
 * Enumerate every runout while it costs at most this many hand evaluations
 * (boards × players). Heads-up preflop (1.7M boards × 2) fits; 3-way preflop
 * does not and is sampled.
 */
export const EXACT_EVAL_LIMIT = 4_000_000;
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

  for (let factor = 1; factor <= k; factor += 1) {
    result = (result * (n - k + factor)) / factor;
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
  const missingCards = 5 - board.length;
  const playerCount = hands.length;
  const dead = new Set([...board, ...hands.flat()]);
  const deck = Uint8Array.from(cardsRemaining(dead));
  const potShares = new Float64Array(playerCount);
  const scores = new Int32Array(playerCount);
  const firstHoleCards = Uint8Array.from(hands, hand => hand[0]);
  const secondHoleCards = Uint8Array.from(hands, hand => hand[1]);
  /** Ties split the pot: share for k winners, precomputed. */
  const tieShare = Float64Array.from({ length: playerCount + 1 }, (_, k) =>
    k ? 1 / k : 0
  );

  // runoutStates[d] = board plus the first d runout cards. The board is shared by
  // every player, so it is built once and each player only adds two cards.
  const runoutStates = Array.from(
    { length: missingCards + 1 },
    createHandState
  );

  for (const card of board) {
    addCardToState(runoutStates[0], runoutStates[0], card);
  }

  const scoreRunout = (state: HandState) => {
    let bestScore = -1;
    let winnerCount = 0;

    for (let player = 0; player < playerCount; player += 1) {
      const value = scoreBoardWithHoleCards(
        state,
        firstHoleCards[player],
        secondHoleCards[player]
      );

      scores[player] = value;

      if (value > bestScore) {
        bestScore = value;
        winnerCount = 1;
      } else if (value === bestScore) {
        winnerCount += 1;
      }
    }

    const winnerShare = tieShare[winnerCount];

    for (let player = 0; player < playerCount; player += 1) {
      if (scores[player] === bestScore) {
        potShares[player] += winnerShare;
      }
    }
  };

  let runoutCount = 0;
  let isSampled = false;

  if (missingCards === 0) {
    scoreRunout(runoutStates[0]);
    runoutCount = 1;
  } else if (
    mode === 'auto' &&
    choose(deck.length, missingCards) * playerCount <= EXACT_EVAL_LIMIT
  ) {
    // Every runout in lexicographic order, iteratively. Only the cards that
    // changed are re-added: moving the last index touches one state.
    const deckSize = deck.length;
    const cardIndices = new Int32Array(missingCards);

    for (let depth = 0; depth < missingCards; depth += 1) {
      cardIndices[depth] = depth;
      addCardToState(runoutStates[depth], runoutStates[depth + 1], deck[depth]);
    }

    for (;;) {
      scoreRunout(runoutStates[missingCards]);
      runoutCount += 1;

      let depth = missingCards - 1;

      while (
        depth >= 0 &&
        cardIndices[depth] === deckSize - missingCards + depth
      ) {
        depth -= 1;
      }

      if (depth < 0) {
        break;
      }

      cardIndices[depth] += 1;
      addCardToState(
        runoutStates[depth],
        runoutStates[depth + 1],
        deck[cardIndices[depth]]
      );

      for (let next = depth + 1; next < missingCards; next += 1) {
        cardIndices[next] = cardIndices[next - 1] + 1;
        addCardToState(
          runoutStates[next],
          runoutStates[next + 1],
          deck[cardIndices[next]]
        );
      }
    }
  } else {
    const nextRandom = prng(seedFor(hands, board));
    const shuffledDeck = deck.slice();
    const sampleState = runoutStates[missingCards];

    for (let sample = 0; sample < SAMPLES; sample += 1) {
      // Partial Fisher–Yates: the first `missingCards` slots become the runout.
      for (let slot = 0; slot < missingCards; slot += 1) {
        const pick =
          slot + Math.floor(nextRandom() * (shuffledDeck.length - slot));
        const card = shuffledDeck[pick];

        shuffledDeck[pick] = shuffledDeck[slot];
        shuffledDeck[slot] = card;
        addCardToState(
          slot === 0 ? runoutStates[0] : sampleState,
          sampleState,
          card
        );
      }

      scoreRunout(sampleState);
    }

    runoutCount = SAMPLES;
    isSampled = true;
  }

  return {
    equities: Array.from(potShares, value => value / runoutCount),
    exact: !isSampled,
  };
};
