import { toNano } from '@ton/core';

export const TON_DECIMALS = 9;

export const toNanoSafe = (amount: number): bigint =>
  toNano(amount.toFixed(TON_DECIMALS));

export const formatTonAmount = (value: number): string =>
  String(Number(value.toFixed(TON_DECIMALS)));
