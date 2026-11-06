import type { DepositStep } from '../types';

export const DEPOSIT_STEP = {
  Amount: 'amount',
  Details: 'details',
} as const satisfies Record<string, DepositStep>;

export const DEPOSIT_STEPS = [
  DEPOSIT_STEP.Amount,
  DEPOSIT_STEP.Details,
] as const satisfies readonly DepositStep[];
