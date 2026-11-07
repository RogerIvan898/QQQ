import { clamp } from 'shared/utils/math';

import type { PreAction, PreActionDecision, PreActionOptions } from './types';

const PRE_ACT_STATUSES = new Set(['IN_GAME', 'RAISE']);

export const canPreAct = (status: string | undefined) =>
  Boolean(status && PRE_ACT_STATUSES.has(status));

export const chipsToCall = (
  currentBet: number,
  committed: number,
  stack: number
) => clamp(currentBet - committed, 0, Math.max(0, stack));

export const isPreActionStale = (preAction: PreAction, toCall: number) => {
  if (preAction === 'check') {
    return toCall > 0;
  }

  if (preAction === 'call') {
    return toCall === 0;
  }

  return false;
};

export const decidePreAction = (
  preAction: PreAction,
  allowed: PreActionOptions
): PreActionDecision | null => {
  if (preAction === 'check') {
    return allowed.canCheck ? 'check' : null;
  }

  if (preAction === 'check_fold') {
    return allowed.canCheck ? 'check' : 'fold';
  }

  return allowed.canCall ? 'call' : null;
};
