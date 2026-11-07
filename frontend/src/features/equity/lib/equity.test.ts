import assert from 'node:assert/strict';

import { computeEquity } from './equity';

const eq = (...args: Parameters<typeof computeEquity>) =>
  computeEquity(...args).equities;
import { evaluate7 } from './evaluator';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const c = (code: string) => RANKS.indexOf(code[0]) * 4 + SUITS.indexOf(code[1]);
const hand = (...codes: string[]) => codes.map(c);
const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} not within ${tolerance} of ${expected}`
  );

// ---- evaluator: category order ----
const royal = evaluate7(hand('As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c'));
const quads = evaluate7(hand('9s', '9h', '9d', '9c', 'Ks', '2d', '3c'));
const boat = evaluate7(hand('9s', '9h', '9d', 'Kc', 'Ks', '2d', '3c'));
const flush = evaluate7(hand('2s', '7s', '9s', 'Js', 'Ks', '2d', '3c'));
const straight = evaluate7(hand('5d', '6s', '7h', '8c', '9s', '2d', 'Kc'));
const wheel = evaluate7(hand('Ad', '2s', '3h', '4c', '5s', '9d', 'Kc'));
const trips = evaluate7(hand('9s', '9h', '9d', '4c', 'Ks', '2d', '3c'));
const twoPair = evaluate7(hand('9s', '9h', '4d', '4c', 'Ks', '2d', '3c'));
const pair = evaluate7(hand('9s', '9h', '4d', '7c', 'Ks', '2d', '3c'));
const high = evaluate7(hand('9s', 'Jh', '4d', '7c', 'Ks', '2d', '3c'));

assert.ok(royal > quads && quads > boat && boat > flush);
assert.ok(flush > straight && straight > wheel && wheel > trips);
assert.ok(trips > twoPair && twoPair > pair && pair > high);

// Kickers and ties.
assert.ok(
  evaluate7(hand('Ah', 'Kd', 'Qs', '9c', '7h', '4d', '2s')) >
    evaluate7(hand('Ah', 'Kd', 'Qs', '9c', '6h', '4d', '2s'))
);
assert.equal(
  evaluate7(hand('Ah', 'Kd', 'Qs', 'Jc', 'Th', '4d', '2s')),
  evaluate7(hand('As', 'Kh', 'Qd', 'Jh', 'Tc', '4c', '3s'))
);

// ---- equity ----
// River: board decides, no randomness.
const river = eq(
  [hand('Ah', 'Ad'), hand('Kh', 'Kd')],
  hand('2c', '7s', '9d', 'Jc', '3h')
);
assert.deepEqual(river, [1, 0]);

// Turn, exact: AA vs KK on a dry board — KK has 2 outs of 44.
const turn = eq(
  [hand('Ah', 'Ad'), hand('Kh', 'Kd')],
  hand('2c', '7s', '9d', 'Jc')
);
near(turn[1], 2 / 44, 1e-9);
near(turn[0] + turn[1], 1, 1e-9);

// Chopped board: both play the royal on the table.
const chop = eq(
  [hand('2h', '3d'), hand('4h', '5d')],
  hand('As', 'Ks', 'Qs', 'Js', 'Ts')
);
assert.deepEqual(chop, [0.5, 0.5]);

// Heads-up preflop is enumerated exactly: AA vs KK ~82%, mirror hands 50/50.
const preflop = computeEquity([hand('Ah', 'Ad'), hand('Kh', 'Kd')], []);
assert.equal(preflop.exact, true);
near(preflop.equities[0], 0.82, 0.01);
assert.deepEqual(eq([hand('Ah', 'Kh'), hand('Ad', 'Kd')], []), [0.5, 0.5]);

// Multiway preflop is sampled and says so.
assert.equal(
  computeEquity([hand('Ah', 'Kh'), hand('Qs', 'Qd'), hand('7c', '8c')], [])
    .exact,
  false
);
near(eq([hand('Ah', 'Ad'), hand('Kh', 'Kd')], [], 'sample')[0], 0.82, 0.01);

// Three-way sums to 1.
const threeWay = eq(
  [hand('Ah', 'Kh'), hand('Qs', 'Qd'), hand('7c', '8c')],
  hand('2h', '9c', 'Td')
);
near(
  threeWay.reduce((sum, value) => sum + value, 0),
  1,
  1e-9
);

// ---- extreme: full 9-handed table ----
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

// Preflop (sampled), flop and turn (exact) all stay a valid distribution.
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

// River: JT makes two pair and takes it all.
assert.deepEqual(
  eq(nine, hand('4c', 'Th', 'Jh', '2c', '9c')),
  [0, 0, 0, 1, 0, 0, 0, 0, 0]
);

// Four-way chop when the board plays.
assert.deepEqual(
  eq(
    [hand('2h', '3d'), hand('4h', '5d'), hand('6h', '7d'), hand('8h', '9d')],
    hand('As', 'Ks', 'Qs', 'Js', 'Ts')
  ),
  [0.25, 0.25, 0.25, 0.25]
);
