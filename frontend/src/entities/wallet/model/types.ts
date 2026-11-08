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

/** `GET /wallet/transactions` response: newest first, cursor-paginated. */
export interface TransactionsPage {
  items: Transaction[];
  /** Opaque cursor for the next page; `null` when there is nothing older. */
  nextCursor: string | null;
}

/** `GET /wallet/balance` response. */
export interface WalletBalance {
  /** Spendable TON, excluding amounts reserved by pending withdrawals. */
  available: number;
}

/** GET /wallet/deposit-address: per-player, never hard-coded in the client. */
export interface DepositAddress {
  address: string;
  /** Comment the transfer must carry so the deposit is credited to you. */
  memo: string;
}

/** POST /wallet/withdraw body. */
export interface WithdrawRequest {
  /** TON address to send to (user-friendly or raw). */
  address: string;
  /** Amount in TON. */
  amount: number;
}
