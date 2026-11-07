import { api } from 'shared/api/axios';

import type {
  TransactionsPage,
  TransactionType,
  WalletBalance,
} from '../model/types';

export const TRANSACTIONS_PAGE_SIZE = 20;

export const walletApi = {
  getBalance: () => api.get<WalletBalance>('/wallet/balance'),
  getTransactions: (
    cursor: string | null,
    type: TransactionType | null,
    limit = TRANSACTIONS_PAGE_SIZE
  ) =>
    api.get<TransactionsPage>('/wallet/transactions', {
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(type ? { type } : {}),
      },
    }),
};
