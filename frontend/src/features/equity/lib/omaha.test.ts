import assert from 'node:assert/strict';

import { evaluateHand, HandCategory } from './evaluator';
import { bestOmahaHand } from './omaha';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const c = (code: string) => RANKS.indexOf(code[0]) * 4 + SUITS.indexOf(code[1]);
const cards = (codes: string) => codes.split(' ').map(c);
const category = (score: number) => score >> 20;

// Four hearts on board and only one in hand: no flush.
{
  const best = bestOmahaHand(cards('Ah Kc Qd 2s'), cards('9h 8h 5h 3h Jc'));

  assert.ok(best);
  assert.notEqual(category(best.score), HandCategory.Flush);
}

// Pocket kings with a paired board: kings full of nines.
{
  const best = bestOmahaHand(cards('Ks Kd 7c 2h'), cards('Kh 9c 9d 4s 3c'));

  assert.ok(best);
  assert.equal(category(best.score), HandCategory.FullHouse);
  assert.deepEqual(best.hole, [0, 1]);
}

// A board straight flush does not play: the hand must use two hole cards.
{
  const best = bestOmahaHand(cards('2c 3d 4h 7s'), cards('As Ks Qs Js Ts'));

  assert.ok(best);
  assert.notEqual(category(best.score), HandCategory.StraightFlush);
}

// Not enough cards yet.
assert.equal(bestOmahaHand(cards('Ah Kh Qh Jh'), cards('2c 3c')), null);

// Random hands against a brute force over every 5-card subset that takes
// exactly two hole cards (written differently from the implementation).
const random = (() => {
  let seed = 42;

  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    return seed / 0x80000000;
  };
})();

for (let round = 0; round < 3000; round += 1) {
  const deck = Array.from({ length: 52 }, (_, index) => index);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));

    [deck[index], deck[pick]] = [deck[pick], deck[index]];
  }

  const hole = deck.slice(0, 4);
  const board = deck.slice(4, 4 + 3 + (round % 3));
  const all = [
    ...hole.map(card => ({ card, hole: true })),
    ...board.map(card => ({ card, hole: false })),
  ];
  let reference = -1;

  for (let mask = 0; mask < 1 << all.length; mask += 1) {
    const chosen = all.filter((_, index) => mask & (1 << index));

    if (chosen.length === 5 && chosen.filter(item => item.hole).length === 2) {
      reference = Math.max(
        reference,
        evaluateHand(chosen.map(item => item.card))
      );
    }
  }

  assert.equal(bestOmahaHand(hole, board)?.score, reference);
}
