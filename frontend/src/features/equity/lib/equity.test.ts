import assert from 'node:assert/strict';

import { computeEquity } from './equity';

const eq = (...args: Parameters<typeof computeEquity>) =>
  computeEquity(...args).equities;
import { evaluateHand } from './evaluator';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const c = (code: string) => RANKS.indexOf(code[0]) * 4 + SUITS.indexOf(code[1]);
const hand = (...codes: string[]) => codes.map(c);
const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} not within ${tolerance} of ${expected}`
  );

const royal = evaluateHand(hand('As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c'));
const quads = evaluateHand(hand('9s', '9h', '9d', '9c', 'Ks', '2d', '3c'));
const boat = evaluateHand(hand('9s', '9h', '9d', 'Kc', 'Ks', '2d', '3c'));
const flush = evaluateHand(hand('2s', '7s', '9s', 'Js', 'Ks', '2d', '3c'));
const straight = evaluateHand(hand('5d', '6s', '7h', '8c', '9s', '2d', 'Kc'));
const wheel = evaluateHand(hand('Ad', '2s', '3h', '4c', '5s', '9d', 'Kc'));
const trips = evaluateHand(hand('9s', '9h', '9d', '4c', 'Ks', '2d', '3c'));
const twoPair = evaluateHand(hand('9s', '9h', '4d', '4c', 'Ks', '2d', '3c'));
const pair = evaluateHand(hand('9s', '9h', '4d', '7c', 'Ks', '2d', '3c'));
const high = evaluateHand(hand('9s', 'Jh', '4d', '7c', 'Ks', '2d', '3c'));

assert.ok(royal > quads && quads > boat && boat > flush);
assert.ok(flush > straight && straight > wheel && wheel > trips);
assert.ok(trips > twoPair && twoPair > pair && pair > high);

assert.ok(
  evaluateHand(hand('Ah', 'Kd', 'Qs', '9c', '7h', '4d', '2s')) >
    evaluateHand(hand('Ah', 'Kd', 'Qs', '9c', '6h', '4d', '2s'))
);
assert.equal(
  evaluateHand(hand('Ah', 'Kd', 'Qs', 'Jc', 'Th', '4d', '2s')),
  evaluateHand(hand('As', 'Kh', 'Qd', 'Jh', 'Tc', '4c', '3s'))
);

const river = eq(
  [hand('Ah', 'Ad'), hand('Kh', 'Kd')],
  hand('2c', '7s', '9d', 'Jc', '3h')
);
assert.deepEqual(river, [1, 0]);

const turn = eq(
  [hand('Ah', 'Ad'), hand('Kh', 'Kd')],
  hand('2c', '7s', '9d', 'Jc')
);
near(turn[1], 2 / 44, 1e-9);
near(turn[0] + turn[1], 1, 1e-9);

const chop = eq(
  [hand('2h', '3d'), hand('4h', '5d')],
  hand('As', 'Ks', 'Qs', 'Js', 'Ts')
);
assert.deepEqual(chop, [0.5, 0.5]);

const preflop = computeEquity([hand('Ah', 'Ad'), hand('Kh', 'Kd')], []);
assert.equal(preflop.exact, true);
near(preflop.equities[0], 0.82, 0.01);
assert.deepEqual(eq([hand('Ah', 'Kh'), hand('Ad', 'Kd')], []), [0.5, 0.5]);

assert.equal(
  computeEquity([hand('Ah', 'Kh'), hand('Qs', 'Qd'), hand('7c', '8c')], [])
    .exact,
  false
);
near(eq([hand('Ah', 'Ad'), hand('Kh', 'Kd')], [], 'sample')[0], 0.82, 0.01);

const threeWay = eq(
  [hand('Ah', 'Kh'), hand('Qs', 'Qd'), hand('7c', '8c')],
  hand('2h', '9c', 'Td')
);
near(
  threeWay.reduce((sum, value) => sum + value, 0),
  1,
  1e-9
);

const nine = [
  hand('Ah', 'Ad'),
  hand('Kh', 'Kd'),
  hand('Qs', 'Qc'),
  hand('Js', 'Tc'),
  hand('9h', '8h'),
  hand('7d', '6d'),
  hand('5s', '5c'),
  hand('As', 'Ks'),
  hand('2h', '3h'),
];
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

for (const board of [
  [],
  hand('4c', 'Th', 'Jh'),
  hand('4c', 'Th', 'Jh', '2c'),
]) {
  const result = eq(nine, board);

  assert.equal(result.length, 9);
  near(sum(result), 1, 1e-9);
  assert.ok(result.every(value => value >= 0 && value <= 1));
}

assert.deepEqual(
  eq(nine, hand('4c', 'Th', 'Jh', '2c', '9c')),
  [0, 0, 0, 1, 0, 0, 0, 0, 0]
);

assert.deepEqual(
  eq(
    [hand('2h', '3d'), hand('4h', '5d'), hand('6h', '7d'), hand('8h', '9d')],
    hand('As', 'Ks', 'Qs', 'Js', 'Ts')
  ),
  [0.25, 0.25, 0.25, 0.25]
);

const big = [nine.slice(0, 7), nine.slice(1, 8)];
assert.deepEqual(eq(big[0], []), eq(big[0], []));
assert.notDeepEqual(
  eq(big[0], []).slice(0, 2),
  eq([nine[0], nine[1], ...nine.slice(3, 8)], []).slice(0, 2)
);
