import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { CardType as Card } from 'entities/card';

import { cardToInt } from './card-int';
import { evaluateHand } from './evaluator';

const CATEGORY_LABELS: MessageDescriptor[] = [
  msg`High card`,
  msg`Pair`,
  msg`Two pair`,
  msg`Three of a kind`,
  msg`Straight`,
  msg`Flush`,
  msg`Full house`,
  msg`Four of a kind`,
  msg`Straight flush`,
];

const CATEGORY_SHIFT = 20;

export const handCategoryLabel = (
  hole: readonly Card[],
  board: readonly Card[]
): MessageDescriptor | null => {
  if (hole.length < 2 || hole.length + board.length < 5) {
    return null;
  }

  const score = evaluateHand([...hole, ...board].map(cardToInt));

  return CATEGORY_LABELS[score >> CATEGORY_SHIFT] ?? null;
};

export const bestFiveCards = (
  hole: readonly Card[],
  board: readonly Card[]
): Card[] | null => {
  const cards = [...hole, ...board];

  if (hole.length < 2 || cards.length < 5) {
    return null;
  }

  const ints = cards.map(cardToInt);
  let best: number[] | null = null;
  let bestScore = -1;

  for (let a = 0; a < cards.length; a += 1)
    for (let b = a + 1; b < cards.length; b += 1)
      for (let c = b + 1; c < cards.length; c += 1)
        for (let d = c + 1; d < cards.length; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) {
            const score = evaluateHand([
              ints[a],
              ints[b],
              ints[c],
              ints[d],
              ints[e],
            ]);

            if (score > bestScore) {
              bestScore = score;
              best = [a, b, c, d, e];
            }
          }

  return best ? best.map(index => cards[index]) : null;
};

const WHOLE_HAND_CATEGORIES = new Set([4, 5, 6, 8]);

export const madeHandCards = (
  hole: readonly Card[],
  board: readonly Card[]
): Card[] | null => {
  const best = bestFiveCards(hole, board);

  if (!best) {
    return null;
  }

  const category = evaluateHand(best.map(cardToInt)) >> CATEGORY_SHIFT;

  if (category === 0) {
    return null;
  }

  const core = WHOLE_HAND_CATEGORIES.has(category)
    ? best
    : best.filter(
        card => best.filter(other => other.rank === card.rank).length >= 2
      );

  return core.some(card => hole.includes(card)) ? core : null;
};
