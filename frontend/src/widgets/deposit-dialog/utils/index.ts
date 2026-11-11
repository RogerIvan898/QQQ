import { formatTonAmount, toNanoSafe } from 'shared/lib/ton';

import { DEPOSIT_STEPS } from '../constants';
import type { DepositStep } from '../types';

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
  const nanotons = toNanoSafe(amount);

  const params = new URLSearchParams({ amount: nanotons.toString() });

  if (memo) {
    params.set('text', memo);
  }

  return `ton://transfer/${encodeURIComponent(address)}?${params}`;
};

export const getDepositStepNumber = (step: DepositStep): number =>
  DEPOSIT_STEPS.indexOf(step) + 1;
