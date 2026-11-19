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

import { $walletAccountId } from './account';
import type {
  DepositAddress,
  Transaction,
  TransactionStatus,
  TransactionType,
  WalletBalance,
} from './types';
import { withdrawalSucceeded } from './withdrawal';

export const STATUS_LABELS = {
  completed: msg`Completed`,
  pending: msg`Pending`,
  failed: msg`Failed`,
} as const satisfies Record<TransactionStatus, MessageDescriptor>;

export const balanceRequested = createEvent();

const fetchBalanceFx = createEffect<string, WalletBalance>(() =>
  walletApi.getBalance()
);

const accountChanged = $walletAccountId.updates;

const balanceLoaded = sample({
  clock: fetchBalanceFx.done,
  source: $walletAccountId,
  filter: (userId, { params }) => userId === params,
  fn: (_, { result }) => result.available,
});

export const $balance = createStore<number | null>(null)
  .on(balanceLoaded, (_, available) => available)
  .reset(accountChanged);

sample({
  clock: balanceRequested,
  source: $walletAccountId,
  filter: (userId): userId is string => userId !== null,
  target: fetchBalanceFx,
});

export const depositAddressRequested = createEvent();

const fetchDepositAddressFx = createEffect<string, DepositAddress>(() =>
  walletApi.getDepositAddress()
);
const addressLoaded = sample({
  clock: fetchDepositAddressFx.done,
  source: $walletAccountId,
  filter: (userId, { params }) => userId === params,
  fn: (_, { result }) => result,
});

const addressFailed = sample({
  clock: fetchDepositAddressFx.fail,
  source: $walletAccountId,
  filter: (userId, { params }) => userId === params,
});

export const $depositAddress = createStore<DepositAddress | null>(null)
  .on(addressLoaded, (_, address) => address)
  .reset(accountChanged);

export const $depositAddressStatus = createStore<
  'idle' | 'loading' | 'ready' | 'failed'
>('idle')
  .on(fetchDepositAddressFx, () => 'loading')
  .on(addressLoaded, () => 'ready')
  .on(addressFailed, () => 'failed')
  .reset(accountChanged);

sample({
  clock: depositAddressRequested,
  source: combine($walletAccountId, $depositAddressStatus, (userId, status) =>
    status === 'loading' ? null : userId
  ),
  filter: (userId): userId is string => userId !== null,
  target: fetchDepositAddressFx,
});

export const transactionsReset = createEvent();

export const nextPageRequested = createEvent();

export const retryRequested = createEvent();

export const typeFilterChanged = createEvent<TransactionType | null>();
export const $typeFilter = createStore<TransactionType | null>(null).on(
  typeFilterChanged,
  (_, type) => type
);

export const walletRefreshRequested = createEvent();

interface PageRequest {
  cursor: string | null;
  type: TransactionType | null;

  generation: number;
}

const fetchPageFx = createEffect(async ({ cursor, type }: PageRequest) =>
  walletApi.getTransactions(cursor, type)
);

const $generation = createStore(0).on(
  [transactionsReset, accountChanged],
  value => value + 1
);

export const $transactions = createStore<Transaction[]>([]);
const $nextCursor = createStore<string | null>(null);

export const $hasMore = createStore(true);
export const $transactionsError = createStore(false);

const $lastRequest = createStore<PageRequest | null>(null);

export const $isLoadingPage = fetchPageFx.pending;

export const $isInitialLoad = combine(
  $transactions,
  $isLoadingPage,
  $hasMore,
  (items, loading, hasMore) => items.length === 0 && loading && hasMore
);

$transactions.reset(transactionsReset, accountChanged);
$nextCursor.reset(transactionsReset, accountChanged);
$hasMore.reset(transactionsReset, accountChanged);
$transactionsError.reset(transactionsReset, accountChanged);
$lastRequest.reset(transactionsReset, accountChanged);

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

sample({
  clock: withdrawalSucceeded,
  target: walletRefreshRequested,
});
