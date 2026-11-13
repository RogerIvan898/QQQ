import assert from 'node:assert/strict';

import { computeOmahaEquity } from './omaha-equity';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const c = (code: string) => RANKS.indexOf(code[0]) * 4 + SUITS.indexOf(code[1]);
const cards = (codes: string) => (codes ? codes.split(' ').map(c) : []);
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

// Preflop multiway: sampled, sums to 1, deterministic.
{
  const hands = [
    cards('Ah As Kd Qd'),
    cards('9c Tc Jh 8h'),
    cards('2s 3s 4d 5d'),
  ];
  const first = computeOmahaEquity(hands, []);
  const second = computeOmahaEquity(hands, []);

  assert.equal(first.exact, false);
  assert.ok(Math.abs(sum(first.equities) - 1) < 1e-9);
  assert.deepEqual(first.equities, second.equities);
}

// Flop heads-up: exact, sums to 1.
{
  const result = computeOmahaEquity(
    [cards('Ah As Kd Qd'), cards('9c Tc Jh 8h')],
    cards('7c 6d 2s')
  );

  assert.equal(result.exact, true);
  assert.ok(Math.abs(sum(result.equities) - 1) < 1e-9);
}

// River: decided. Full house beats a hand that needs a board-only flush.
{
  const result = computeOmahaEquity(
    [cards('Ks Kd 7c 2h'), cards('Ah Qh 3d 4c')],
    cards('Kh 9c 9d 4s 3c')
  );

  assert.equal(result.exact, true);
  assert.deepEqual(result.equities, [1, 0]);
}

// Identical-strength hands split the pot.
{
  const result = computeOmahaEquity(
    [cards('Ac Kc 2d 3d'), cards('Ad Kd 2c 3c')],
    cards('Qh Js Th 7s 6h')
  );

  assert.deepEqual(result.equities, [0.5, 0.5]);
}
