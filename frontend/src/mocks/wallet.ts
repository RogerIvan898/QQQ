import { delay, http, HttpResponse } from 'msw';

import type {
  Transaction,
  TransactionsPage,
  WalletBalance,
} from 'entities/wallet';

const ADDRESSES = [
  'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
  'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
  'UQA-hgA0arLRETGFy5ccxv11acPYBUpU49X8RyqfIju3tGci',
];
const TOTAL = 57;
const MAX_LIMIT = 50;

const hash = (seed: number) =>
  Array.from({ length: 64 }, (_, index) =>
    ((seed * 31 + index * 17) % 16).toString(16)
  ).join('');

// Deterministic history, newest first: a few hours apart, older going down.
const TRANSACTIONS: Transaction[] = Array.from(
  { length: TOTAL },
  (_, index) => {
    const isDeposit = index % 3 !== 1;
    const status =
      index === 0 ? 'pending' : index % 11 === 5 ? 'failed' : 'completed';

    return {
      id: `tx-${TOTAL - index}`,
      type: isDeposit ? 'deposit' : 'withdrawal',
      status,
      amount: [25, 12, 50, 7.5, 10, 40, 3, 100][index % 8],
      createdAt: new Date(
        Date.now() - (index * 9 + 0.5) * 3_600_000
      ).toISOString(),
      address: ADDRESSES[index % ADDRESSES.length],
      ...(status === 'completed' ? { txHash: hash(index + 1) } : {}),
      ...(isDeposit ? {} : { fee: 0.05 }),
      ...(status === 'failed'
        ? { failureReason: isDeposit ? 'missing-memo' : 'rejected' }
        : {}),
    } satisfies Transaction;
  }
);

export const walletHandlers = [
  http.get('*/wallet/balance', async () => {
    await delay(250);

    return HttpResponse.json<WalletBalance>({ available: 42.5 });
  }),

  // Cursor = index of the first item of the page (opaque to the client).
  http.get('*/wallet/transactions', async ({ request }) => {
    await delay(600);

    const url = new URL(request.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get('limit')) || 20)
    );
    const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
    const type = url.searchParams.get('type');
    const source = type
      ? TRANSACTIONS.filter(transaction => transaction.type === type)
      : TRANSACTIONS;
    const items = source.slice(start, start + limit);
    const next = start + limit;

    return HttpResponse.json<TransactionsPage>({
      items,
      nextCursor: next < source.length ? String(next) : null,
    });
  }),
];
