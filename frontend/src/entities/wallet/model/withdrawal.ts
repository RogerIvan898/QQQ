import { createEffect } from 'effector';

import { sessionModel } from 'entities/session';
import { isApiError } from 'shared/api';
import { readStorage, writeStorage } from 'shared/lib/storage';

import { walletApi } from '../api';

import type { WithdrawRequest } from './types';

const sendWithdrawalFx = createEffect(
  ({ request, id }: { request: WithdrawRequest; id: string }) =>
    walletApi.withdraw(request, id)
);

// Storage may be unavailable in a private WebView.
const unresolved = new Map<string, string>();

const forget = (key: string) => {
  unresolved.delete(key);
  writeStorage(key, null);
};

export const withdrawFx = createEffect(async (request: WithdrawRequest) => {
  const userId = sessionModel.$currentUserId.getState();
  if (!userId || sendWithdrawalFx.pending.getState()) {
    throw new Error('Withdrawal unavailable');
  }

  // Keep the same operation across a timeout, a reopened form or a reload.
  const key = `poker:withdraw-request:${userId}:${request.address}:${request.amount}`;
  const id = unresolved.get(key) ?? readStorage(key) ?? crypto.randomUUID();
  unresolved.set(key, id);
  writeStorage(key, id);

  try {
    const transaction = await sendWithdrawalFx({ request, id });
    if (!transaction?.id) throw new Error('Missing withdrawal confirmation');

    forget(key);

    return transaction;
  } catch (error) {
    if (
      isApiError(error) &&
      ['invalid_address', 'invalid_amount', 'insufficient_funds'].includes(
        error.code
      )
    ) {
      forget(key);
    }

    throw error;
  }
});
