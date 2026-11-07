import { toNano } from '@ton/core';

/** TON has 9 decimals (1 TON = 10^9 nanoton). */
export const TON_DECIMALS = 9;

/**
 * TON amount → nanoton. `toNano` rejects exponent notation, which
 * `String(0.0000001)` produces, so the amount is fixed to 9 decimals first.
 */
export const toNanoSafe = (amount: number): bigint =>
  toNano(amount.toFixed(TON_DECIMALS));

/** Amount as a plain decimal string, at most 9 decimals, no trailing zeros. */
export const formatTonAmount = (value: number): string =>
  String(Number(value.toFixed(TON_DECIMALS)));
