import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import {
  combine,
  createEffect,
  createEvent,
  createStore,
  sample,
} from 'effector';

import { walletApi } from '../api';

import type {
  DepositAddress,
  Transaction,
  TransactionStatus,
  TransactionType,
  WithdrawRequest,
} from './types';

export const STATUS_LABELS = {
  completed: msg`Completed`,
  pending: msg`Pending`,
  failed: msg`Failed`,
} as const satisfies Record<TransactionStatus, MessageDescriptor>;

// ---------- Balance ----------

export const balanceRequested = createEvent();

const fetchBalanceFx = createEffect(() => walletApi.getBalance());

/** Spendable TON; `null` until the first successful load. */
export const $balance = createStore<number | null>(null).on(
  fetchBalanceFx.doneData,
  (_, balance) => balance.available
);

sample({ clock: balanceRequested, target: fetchBalanceFx });

// ---------- Deposit address ----------

export const depositAddressRequested = createEvent();

const fetchDepositAddressFx = createEffect(() => walletApi.getDepositAddress());

/** This player's deposit address and memo; null until loaded. */
export const $depositAddress = createStore<DepositAddress | null>(null).on(
  fetchDepositAddressFx.doneData,
  (_, address) => address
);

export const $depositAddressStatus = createStore<
  'idle' | 'loading' | 'ready' | 'failed'
>('idle')
  .on(fetchDepositAddressFx, () => 'loading')
  .on(fetchDepositAddressFx.done, () => 'ready')
  .on(fetchDepositAddressFx.fail, () => 'failed');

sample({
  clock: depositAddressRequested,
  filter: fetchDepositAddressFx.pending.map(pending => !pending),
  target: fetchDepositAddressFx,
});

// ---------- Withdraw ----------

/** Sends a withdrawal; resolves with the new (pending) transaction. */
export const withdrawFx = createEffect((request: WithdrawRequest) =>
  walletApi.withdraw(request)
);

// ---------- Transactions (cursor pagination) ----------

/** Drops what is loaded and fetches the newest page. */
export const transactionsReset = createEvent();
/** Fetches the next (older) page, if there is one and none is in flight. */
export const nextPageRequested = createEvent();
/** Repeats the request that failed. */
export const retryRequested = createEvent();

/** All / deposits / withdrawals; `null` = all. Changing it reloads page 1. */
export const typeFilterChanged = createEvent<TransactionType | null>();
export const $typeFilter = createStore<TransactionType | null>(null).on(
  typeFilterChanged,
  (_, type) => type
);

/** Balance and history after a deposit or withdrawal. */
export const walletRefreshRequested = createEvent();

interface PageRequest {
  cursor: string | null;
  type: TransactionType | null;
  /** Requests from before a reset are ignored when they come back. */
  generation: number;
}

const fetchPageFx = createEffect(async ({ cursor, type }: PageRequest) =>
  walletApi.getTransactions(cursor, type)
);

const $generation = createStore(0).on(transactionsReset, value => value + 1);

export const $transactions = createStore<Transaction[]>([]);
const $nextCursor = createStore<string | null>(null);
/** `false` once the server says there is nothing older. */
export const $hasMore = createStore(true);
export const $transactionsError = createStore(false);
/** The cursor of the last request, to retry it and to never ask twice. */
const $lastRequest = createStore<PageRequest | null>(null);

export const $isLoadingPage = fetchPageFx.pending;
/** True before the first page has arrived (initial skeleton/spinner). */
export const $isInitialLoad = combine(
  $transactions,
  $isLoadingPage,
  $hasMore,
  (items, loading, hasMore) => items.length === 0 && loading && hasMore
);

$transactions.reset(transactionsReset);
$nextCursor.reset(transactionsReset);
$hasMore.reset(transactionsReset);
$transactionsError.reset(transactionsReset);
$lastRequest.reset(transactionsReset);

sample({
  clock: typeFilterChanged,
  target: transactionsReset,
});

sample({
  clock: transactionsReset,
  source: { generation: $generation, type: $typeFilter },
  fn: ({ generation, type }): PageRequest => ({
    cursor: null,
    type,
    generation,
  }),
  target: fetchPageFx,
});

sample({
  clock: nextPageRequested,
  source: {
    cursor: $nextCursor,
    type: $typeFilter,
    generation: $generation,
    hasMore: $hasMore,
    loading: $isLoadingPage,
    error: $transactionsError,
    last: $lastRequest,
  },
  // One request at a time, never past the end, never the same page twice,
  // and no auto-retry loop while an error is shown.
  filter: ({ cursor, hasMore, loading, error, last }) =>
    hasMore && !loading && !error && cursor !== null && last?.cursor !== cursor,
  fn: ({ cursor, type, generation }): PageRequest => ({
    cursor,
    type,
    generation,
  }),
  target: fetchPageFx,
});

sample({
  clock: retryRequested,
  source: { last: $lastRequest, loading: $isLoadingPage },
  filter: ({ last, loading }) => last !== null && !loading,
  fn: ({ last }) => last as PageRequest,
  target: fetchPageFx,
});

$lastRequest.on(fetchPageFx, (_, request) => request);
$transactionsError.on(fetchPageFx, () => false);

const pageLoaded = sample({
  clock: fetchPageFx.done,
  source: $generation,
  filter: (generation, { params }) => params.generation === generation,
  fn: (_, { result }) => result,
});

$transactions.on(pageLoaded, (items, page) => {
  // Guard against overlap if the server shifted (e.g. a new transaction).
  const seen = new Set(items.map(item => item.id));

  return [...items, ...page.items.filter(item => !seen.has(item.id))];
});
$nextCursor.on(pageLoaded, (_, page) => page.nextCursor);
$hasMore.on(pageLoaded, (_, page) => page.nextCursor !== null);

sample({
  clock: fetchPageFx.fail,
  source: $generation,
  filter: (generation, { params }) => params.generation === generation,
  fn: () => true,
  target: $transactionsError,
});

sample({
  clock: walletRefreshRequested,
  target: [balanceRequested, transactionsReset],
});

// A withdrawal changes the balance and adds a transaction: reload both.
sample({
  clock: withdrawFx.done,
  target: walletRefreshRequested,
});
