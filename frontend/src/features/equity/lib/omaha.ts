import { evaluateHand } from './evaluator';

export interface OmahaBest {
  score: number;
  /** Indices into the hole cards: exactly two. */
  hole: [number, number];
  /** Indices into the board: exactly three. */
  board: [number, number, number];
}

/**
 * Best Omaha hand: exactly two hole cards and exactly three board cards
 * (rank * 4 + suit ints). Null until there are two hole and three board cards.
 */
export const bestOmahaHand = (
  hole: readonly number[],
  board: readonly number[]
): OmahaBest | null => {
  if (hole.length < 2 || board.length < 3) {
    return null;
  }

  let best: OmahaBest | null = null;
  const five = [0, 0, 0, 0, 0];

  for (let i = 0; i < hole.length; i += 1) {
    for (let j = i + 1; j < hole.length; j += 1) {
      five[0] = hole[i];
      five[1] = hole[j];

      for (let a = 0; a < board.length; a += 1) {
        for (let b = a + 1; b < board.length; b += 1) {
          for (let c = b + 1; c < board.length; c += 1) {
            five[2] = board[a];
            five[3] = board[b];
            five[4] = board[c];

            const score = evaluateHand(five);

            if (!best || score > best.score) {
              best = { score, hole: [i, j], board: [a, b, c] };
            }
          }
        }
      }
    }
  }

  return best;
};
