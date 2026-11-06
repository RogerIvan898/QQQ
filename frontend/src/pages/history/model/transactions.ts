import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export type TransactionType = 'deposit' | 'withdrawal';
export type TransactionStatus = 'completed' | 'pending' | 'failed';
export type FailureReason = 'missing-memo' | 'insufficient-funds' | 'rejected';

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  /** Amount in TON, always positive; the sign comes from `type`. */
  amount: number;
  /** ISO timestamp. */
  createdAt: string;
  /** On-chain transaction hash, once known. */
  txHash?: string;
  /** Wallet the funds came from (deposit) or went to (withdrawal). */
  address: string;
  /** Network fee in TON charged on withdrawals. */
  fee?: number;
  /** Why a failed transaction did not go through. */
  failureReason?: FailureReason;
}

export const STATUS_LABELS = {
  completed: msg`Completed`,
  pending: msg`Pending`,
  failed: msg`Failed`,
} as const satisfies Record<TransactionStatus, MessageDescriptor>;

export type HistoryFilter = 'all' | TransactionType;

export const HISTORY_FILTERS: HistoryFilter[] = [
  'all',
  'deposit',
  'withdrawal',
];

export const historyFilterLabel = (filter: HistoryFilter) => {
  switch (filter) {
    case 'all':
      return msg`All`;
    case 'deposit':
      return msg`Deposits`;
    case 'withdrawal':
      return msg`Withdrawals`;
  }
};

export const filterTransactions = (
  transactions: Transaction[],
  filter: HistoryFilter
) =>
  filter === 'all'
    ? transactions
    : transactions.filter(transaction => transaction.type === filter);

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

// TODO: replace with the backend history endpoint.
export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 't8',
    type: 'withdrawal',
    status: 'pending',
    amount: 12,
    fee: 0.05,
    createdAt: hoursAgo(0.4),
    address: 'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
  },
  {
    id: 't7',
    type: 'deposit',
    status: 'completed',
    amount: 25,
    createdAt: hoursAgo(3),
    address: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
    txHash: 'b7c1e94a2f0d4e8a9c3b51f6a0e2d7c4b8f1a3e5d6c9b2a4f7e0d1c3b5a6f8e9',
  },
  {
    id: 't6',
    type: 'deposit',
    status: 'failed',
    amount: 5,
    failureReason: 'missing-memo',
    createdAt: hoursAgo(5),
    address: 'UQA-hgA0arLRETGFy5ccxv11acPYBUpU49X8RyqfIju3tGci',
  },
  {
    id: 't5',
    type: 'withdrawal',
    status: 'completed',
    amount: 40,
    fee: 0.05,
    createdAt: hoursAgo(28),
    address: 'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
    txHash: '4e2a9d1c7b3f5e8a0c6d2b4f1e9a7c3d5b8e0f2a4c6e1d3b5f7a9c0e2d4b6f8a',
  },
  {
    id: 't4',
    type: 'deposit',
    status: 'completed',
    amount: 50,
    createdAt: hoursAgo(31),
    address: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
    txHash: '9a1c3e5b7d0f2a4c6e8b1d3f5a7c9e0b2d4f6a8c1e3b5d7f9a0c2e4b6d8f1a3c',
  },
  {
    id: 't3',
    type: 'deposit',
    status: 'completed',
    amount: 10,
    createdAt: hoursAgo(24 * 4),
    address: 'UQA-hgA0arLRETGFy5ccxv11acPYBUpU49X8RyqfIju3tGci',
    txHash: 'c3e5a7b9d1f0e2c4a6b8d0f1e3a5c7b9d2f4e6a8c0b1d3f5e7a9c2b4d6f8e0a1',
  },
  {
    id: 't2',
    type: 'withdrawal',
    status: 'completed',
    amount: 7.5,
    fee: 0.05,
    createdAt: hoursAgo(24 * 9),
    address: 'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
    txHash: 'f1d3b5a7c9e0f2d4b6a8c1e3d5f7b9a0c2e4d6f8b1a3c5e7d9f0b2a4c6e8d1f3',
  },
  {
    id: 't1',
    type: 'deposit',
    status: 'completed',
    amount: 20,
    createdAt: hoursAgo(24 * 12),
    address: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
    txHash: 'a0b2c4d6e8f1a3b5c7d9e0f2a4b6c8d1e3f5a7b9c0d2e4f6a8b1c3d5e7f9a2b4',
  },
];
