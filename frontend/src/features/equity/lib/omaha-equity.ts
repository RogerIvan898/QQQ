import {
  cardsRemaining,
  choose,
  EXACT_EVAL_LIMIT,
  prng,
  seedFor,
  type EquityMode,
  type EquityResult,
} from './equity';
import { omahaScore } from './omaha';

/** Two hole cards out of four times three board cards out of five. */
const EVALS_PER_PLAYER = 6 * 10;

/** Smaller than Hold'em's: each runout costs ~60x more evaluations. */
export const OMAHA_SAMPLES = 6_000;

/**
 * Omaha equity: exact over every runout when that fits the evaluation budget,
 * otherwise a deterministic sample (same seed for the same input).
 */
export const computeOmahaEquity = (
  hands: number[][],
  board: number[],
  mode: EquityMode = 'auto'
): EquityResult => {
  const missingCards = 5 - board.length;
  const playerCount = hands.length;
  const deck = cardsRemaining(new Set([...board, ...hands.flat()]));
  const potShares = new Float64Array(playerCount);
  const scores = new Int32Array(playerCount);
  const fullBoard = new Uint8Array(5);

  fullBoard.set(board);

  const scoreRunout = () => {
    let bestScore = -1;
    let winners = 0;

    for (let player = 0; player < playerCount; player += 1) {
      const score = omahaScore(hands[player], fullBoard);

      scores[player] = score;

      if (score > bestScore) {
        bestScore = score;
        winners = 1;
      } else if (score === bestScore) {
        winners += 1;
      }
    }

    for (let player = 0; player < playerCount; player += 1) {
      if (scores[player] === bestScore) {
        potShares[player] += 1 / winners;
      }
    }
  };

  const runouts = choose(deck.length, missingCards);
  const exact =
    mode === 'auto' &&
    runouts * playerCount * EVALS_PER_PLAYER <= EXACT_EVAL_LIMIT;
  let count = 0;

  if (missingCards === 0) {
    scoreRunout();
    count = 1;
  } else if (exact) {
    const indices = Array.from({ length: missingCards }, (_, slot) => slot);

    for (;;) {
      for (let slot = 0; slot < missingCards; slot += 1) {
        fullBoard[board.length + slot] = deck[indices[slot]];
      }

      scoreRunout();
      count += 1;

      let slot = missingCards - 1;

      while (slot >= 0 && indices[slot] === deck.length - missingCards + slot) {
        slot -= 1;
      }

      if (slot < 0) {
        break;
      }

      indices[slot] += 1;

      for (let next = slot + 1; next < missingCards; next += 1) {
        indices[next] = indices[next - 1] + 1;
      }
    }
  } else {
    const nextRandom = prng(seedFor(hands, board));
    const shuffled = deck.slice();

    for (let sample = 0; sample < OMAHA_SAMPLES; sample += 1) {
      for (let slot = 0; slot < missingCards; slot += 1) {
        const pick = slot + Math.floor(nextRandom() * (shuffled.length - slot));
        const card = shuffled[pick];

        shuffled[pick] = shuffled[slot];
        shuffled[slot] = card;
        fullBoard[board.length + slot] = card;
      }

      scoreRunout();
    }

    count = OMAHA_SAMPLES;
  }

  return {
    equities: Array.from(potShares, share => share / count),
    exact: missingCards === 0 || exact,
  };
};
