import { api, expectResponse } from 'shared/api';
import { isFiniteNumber, isRecord } from 'shared/utils/validation';

import type {
  DepositAddress,
  Transaction,
  TransactionsPage,
  TransactionType,
  WalletBalance,
  WithdrawRequest,
} from '../model/types';

const TRANSACTIONS_PAGE_SIZE = 20;

const isBalance = (value: unknown): value is WalletBalance =>
  isRecord(value) && isFiniteNumber(value.available);

const isDepositAddress = (value: unknown): value is DepositAddress =>
  isRecord(value) &&
  typeof value.address === 'string' &&
  Boolean(value.address.trim()) &&
  typeof value.memo === 'string';

const isTransaction = (value: unknown): value is Transaction =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  Boolean(value.id.trim()) &&
  (value.type === 'deposit' || value.type === 'withdrawal') &&
  (value.status === 'completed' ||
    value.status === 'pending' ||
    value.status === 'failed') &&
  isFiniteNumber(value.amount) &&
  typeof value.address === 'string' &&
  typeof value.createdAt === 'string' &&
  Number.isFinite(Date.parse(value.createdAt)) &&
  (value.txHash === undefined || typeof value.txHash === 'string') &&
  (value.fee === undefined || isFiniteNumber(value.fee)) &&
  (value.failureReason === undefined ||
    value.failureReason === 'missing-memo' ||
    value.failureReason === 'insufficient-funds' ||
    value.failureReason === 'rejected');

const isTransactionsPage = (value: unknown): value is TransactionsPage =>
  isRecord(value) &&
  Array.isArray(value.items) &&
  value.items.every(isTransaction) &&
  (value.nextCursor === null || typeof value.nextCursor === 'string');

export const walletApi = {
  getBalance: async () =>
    expectResponse(await api.get('/wallet/balance'), isBalance),

  getDepositAddress: async () =>
    expectResponse(await api.get('/wallet/deposit-address'), isDepositAddress),

  withdraw: async (request: WithdrawRequest, id: string) =>
    expectResponse(
      await api.post('/wallet/withdraw', request, {
        headers: { 'Idempotency-Key': id },
      }),
      isTransaction
    ),
  getTransactions: async (
    cursor: string | null,
    type: TransactionType | null,
    limit = TRANSACTIONS_PAGE_SIZE
  ) =>
    expectResponse(
      await api.get('/wallet/transactions', {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(type ? { type } : {}),
        },
      }),
      isTransactionsPage
    ),
};
