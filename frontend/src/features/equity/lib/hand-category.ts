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
