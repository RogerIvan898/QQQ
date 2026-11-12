import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { CardType as Card } from 'entities/card';

import { cardToInt } from './card-int';
import { evaluateHand, HandCategory } from './evaluator';

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

// How many cards of each scored rank slot make up the five, per category.
const SLOT_COUNTS: Partial<Record<number, number[]>> = {
  [HandCategory.HighCard]: [1, 1, 1, 1, 1],
  [HandCategory.Pair]: [2, 1, 1, 1],
  [HandCategory.TwoPair]: [2, 2, 1],
  [HandCategory.Trips]: [3, 1, 1],
  [HandCategory.Flush]: [1, 1, 1, 1, 1],
  [HandCategory.FullHouse]: [3, 2],
  [HandCategory.Quads]: [4, 1],
};

const RANK_BITS = 4;
const TOP_SLOT_SHIFT = 16;

const flushSuit = (ints: readonly number[]) => {
  const counts = [0, 0, 0, 0];

  for (const card of ints) {
    counts[card & 3] += 1;
  }

  return counts.findIndex(count => count >= 5);
};

/**
 * The five cards behind the best hand. The evaluator's score already holds
 * the category and the ranks that matter (slot by slot), so the cards are
 * picked by rank — and by suit for flushes — instead of scoring all 21
 * five-card subsets.
 */
export const bestFiveCards = (
  hole: readonly Card[],
  board: readonly Card[]
): Card[] | null => {
  const cards = [...hole, ...board];

  if (hole.length < 2 || cards.length < 5) {
    return null;
  }

  const ints = cards.map(cardToInt);
  const score = evaluateHand(ints);
  const category = score >> CATEGORY_SHIFT;
  const slot = (index: number) =>
    (score >> (TOP_SLOT_SHIFT - RANK_BITS * index)) & 0xf;
  const isStraight =
    category === HandCategory.Straight ||
    category === HandCategory.StraightFlush;
  const suit =
    category === HandCategory.Flush || category === HandCategory.StraightFlush
      ? flushSuit(ints)
      : -1;

  // A straight stores only its top rank; the wheel wraps to the ace.
  const wanted = isStraight
    ? [0, 1, 2, 3, 4].map(step => ({
        rank: (slot(0) - step + 13) % 13,
        count: 1,
      }))
    : (SLOT_COUNTS[category] ?? []).map((count, index) => ({
        rank: slot(index),
        count,
      }));

  const picked = new Set<number>();

  for (const { rank, count } of wanted) {
    let left = count;

    for (let index = 0; index < ints.length && left > 0; index += 1) {
      const card = ints[index];

      if (
        !picked.has(index) &&
        card >> 2 === rank &&
        (suit === -1 || (card & 3) === suit)
      ) {
        picked.add(index);
        left -= 1;
      }
    }
  }

  return [...picked].sort((a, b) => a - b).map(index => cards[index]);
};

const WHOLE_HAND_CATEGORIES = new Set<number>([
  HandCategory.Straight,
  HandCategory.Flush,
  HandCategory.FullHouse,
  HandCategory.StraightFlush,
]);

export const madeHandCards = (
  hole: readonly Card[],
  board: readonly Card[]
): Card[] | null => {
  const best = bestFiveCards(hole, board);

  if (!best) {
    return null;
  }

  const category = evaluateHand(best.map(cardToInt)) >> CATEGORY_SHIFT;

  if (category === HandCategory.HighCard) {
    return null;
  }

  const core = WHOLE_HAND_CATEGORIES.has(category)
    ? best
    : best.filter(
        card => best.filter(other => other.rank === card.rank).length >= 2
      );

  return core.some(card => hole.includes(card)) ? core : null;
};
