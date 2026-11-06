import { toNano } from '@ton/core';

import { DEPOSIT_STEPS } from '../constants';
import type { DepositStep } from '../types';

const TON_DECIMALS = 9;

export const formatTonAmount = (value: number): string =>
  String(Number(value.toFixed(TON_DECIMALS)));

export const toDepositInputValue = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) {
    return '';
  }

  return formatTonAmount(value).replace('.', ',');
};

export const buildTonTransferLink = (
  address: string,
  amount: number,
  memo?: string
): string => {
  const nanotons = toNano(amount.toFixed(TON_DECIMALS));

  const params = new URLSearchParams({ amount: nanotons.toString() });

  if (memo) {
    params.set('text', memo);
  }

  return `ton://transfer/${encodeURIComponent(address)}?${params}`;
};

export const getDepositStepNumber = (step: DepositStep): number =>
  DEPOSIT_STEPS.indexOf(step) + 1;
