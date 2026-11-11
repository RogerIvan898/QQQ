import { api } from 'shared/api';

import type {
  DepositAddress,
  Transaction,
  TransactionsPage,
  TransactionType,
  WalletBalance,
  WithdrawRequest,
} from '../model/types';

const TRANSACTIONS_PAGE_SIZE = 20;

export const walletApi = {
  getBalance: () => api.get<WalletBalance>('/wallet/balance'),

  getDepositAddress: () => api.get<DepositAddress>('/wallet/deposit-address'),

  withdraw: (request: WithdrawRequest) =>
    api.post<Transaction, WithdrawRequest>('/wallet/withdraw', request),
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
