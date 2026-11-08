export type TransactionType = 'deposit' | 'withdrawal';
export type TransactionStatus = 'completed' | 'pending' | 'failed';
export type FailureReason = 'missing-memo' | 'insufficient-funds' | 'rejected';

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;

  amount: number;

  createdAt: string;

  txHash?: string;

  address: string;

  fee?: number;

  failureReason?: FailureReason;
}

export interface TransactionsPage {
  items: Transaction[];

  nextCursor: string | null;
}

export interface WalletBalance {
  available: number;
}

export interface DepositAddress {
  address: string;

  memo: string;
}

export interface WithdrawRequest {
  address: string;

  amount: number;
}
