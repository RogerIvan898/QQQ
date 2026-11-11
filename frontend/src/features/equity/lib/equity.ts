import {
  addCardToState,
  createHandState,
  scoreBoardWithHoleCards,
  type HandState,
} from './evaluator';

export const EXACT_EVAL_LIMIT = 4_000_000;
export const SAMPLES = 40_000;

export type EquityMode = 'auto' | 'sample';

export interface EquityResult {
  equities: number[];

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

const seedFor = (hands: number[][], board: number[]) => {
  let hash = 0x811c9dc5;

  for (const card of [...hands.flat(), 0xff, ...board]) {
    hash ^= card;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

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

  const tieShare = Float64Array.from({ length: playerCount + 1 }, (_, k) =>
    k ? 1 / k : 0
  );

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
