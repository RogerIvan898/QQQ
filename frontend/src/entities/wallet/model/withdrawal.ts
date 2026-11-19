import { createEffect, createEvent, sample } from 'effector';

import { sessionModel } from 'entities/session';
import { isApiError } from 'shared/api';
import { readStorage, writeStorage } from 'shared/lib/storage';

import { walletApi } from '../api';

import type { WithdrawRequest } from './types';

// Storage may be unavailable in a private WebView.
const unresolved = new Map<string, string>();

const forget = (key: string) => {
  unresolved.delete(key);
  writeStorage(key, null);
};

interface WithdrawalSubmission {
  request: WithdrawRequest;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export const withdrawRequested = createEvent<WithdrawalSubmission>();

const withdrawFx = createEffect(
  async ({
    submission: { request },
    userId,
  }: {
    submission: WithdrawalSubmission;
    userId: string;
  }) => {
    // Keep the same operation across a timeout, a reopened form or a reload.
    const key = `poker:withdraw-request:${userId}:${request.address}:${request.amount}`;
    const id = unresolved.get(key) ?? readStorage(key) ?? crypto.randomUUID();
    unresolved.set(key, id);
    writeStorage(key, id);

    try {
      const transaction = await walletApi.withdraw(request, id);
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
  }
);

export const $withdrawPending = withdrawFx.pending;
export const withdrawalSucceeded = withdrawFx.doneData;

const submissionReceived = sample({
  clock: withdrawRequested,
  source: { userId: sessionModel.$currentUserId, pending: $withdrawPending },
  fn: ({ userId, pending }, submission) => ({ userId, pending, submission }),
});

sample({
  clock: submissionReceived,
  filter: (request): request is typeof request & { userId: string } =>
    request.userId !== null && !request.pending,
  target: withdrawFx,
});

submissionReceived.watch(({ userId, pending, submission }) => {
  if (userId === null || pending) {
    submission.reject(new Error('Withdrawal unavailable'));
  }
});

withdrawFx.done.watch(({ params }) => params.submission.resolve());
withdrawFx.fail.watch(({ params, error }) => params.submission.reject(error));
