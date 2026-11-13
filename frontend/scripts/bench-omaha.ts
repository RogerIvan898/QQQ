// Omaha equity timing (bun scripts/bench-omaha.ts): keep the worst case well under the 1 s budget on phones.
import { computeOmahaEquity } from '../src/features/equity/lib/omaha-equity';
const R = '23456789TJQKA',
  S = 'cdhs';
const c = (x: string) => R.indexOf(x[0]) * 4 + S.indexOf(x[1]);
const h = (s: string) => (s ? s.split(' ').map(c) : []);
const cases: [string, number[][], number[]][] = [
  ['HU preflop', [h('Ah As Kd Qd'), h('9c Tc Jh 8h')], []],
  [
    '4-way preflop',
    [h('Ah As Kd Qd'), h('9c Tc Jh 8h'), h('2s 3s 4d 5d'), h('Kc Ks 7h 6h')],
    [],
  ],
  ['HU flop', [h('Ah As Kd Qd'), h('9c Tc Jh 8h')], h('7c 6d 2s')],
  [
    '4-way flop',
    [h('Ah As Kd Qd'), h('9c Tc Jh 8h'), h('2s 3s 4d 5d'), h('Kc Ks 7h 6h')],
    h('7c 6d 2h'),
  ],
];
for (const [n, hands, b] of cases) {
  computeOmahaEquity(hands, b);
  const t = performance.now();
  const r = computeOmahaEquity(hands, b);
  console.log(
    n.padEnd(14),
    (performance.now() - t).toFixed(1) + 'ms',
    'exact=' + r.exact,
    r.equities.map(x => (x * 100).toFixed(1)).join(' / ')
  );
}
