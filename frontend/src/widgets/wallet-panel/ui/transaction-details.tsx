import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Ellipsis,
  Globe,
  X,
} from 'lucide-react';

import {
  STATUS_LABELS,
  type FailureReason,
  type Transaction,
} from 'entities/wallet';
import { useCopyToClipboard } from 'shared/lib/clipboard';
import { Dialog } from 'shared/ui/dialog';
import { cn } from 'shared/utils/cn';
import { formatBalance } from 'shared/utils/format';

import styles from './transaction-details.module.css';

const FAILURE_REASONS = {
  'missing-memo': msg`The transfer was sent without the required memo. Contact support to get it credited.`,
  'insufficient-funds': msg`Not enough balance to cover the amount and the network fee.`,
  rejected: msg`The transfer was rejected by the network.`,
} as const satisfies Record<FailureReason, MessageDescriptor>;

const COPIED_RESET_MS = 1500;

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
}

export const TransactionDetails = ({ transaction, onClose }: Props) => {
  const { i18n, t } = useLingui();
  const { copied, copy } = useCopyToClipboard(COPIED_RESET_MS);

  if (!transaction) {
    return null;
  }

  const isDeposit = transaction.type === 'deposit';
  const isPending = transaction.status === 'pending';
  const isFailed = transaction.status === 'failed';
  const Icon = isFailed
    ? X
    : isPending
      ? Ellipsis
      : isDeposit
        ? ArrowDownLeft
        : ArrowUpRight;
  const ton = (value: number) => `${formatBalance(value, i18n.locale)} TON`;
  const when = new Intl.DateTimeFormat(i18n.locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(transaction.createdAt));
  const typeLabel = isDeposit
    ? t({ message: 'Deposit', context: 'transaction' })
    : t({ message: 'Withdrawal', context: 'transaction' });

  return (
    <Dialog open variant="bottom" onClose={onClose}>
      <div className={styles.hero}>
        <span
          className={cn(
            styles.heroIcon,
            isFailed
              ? styles.heroIconFailed
              : isPending
                ? styles.heroIconPending
                : isDeposit
                  ? styles.heroIconDeposit
                  : styles.heroIconWithdrawal
          )}
        >
          <Icon size={34} strokeWidth={2.5} />
        </span>

        <span
          className={cn(
            styles.heroAmount,
            transaction.status === 'failed' && styles.heroAmountFailed
          )}
        >
          {isDeposit ? '+ ' : '− '}
          {ton(transaction.amount)}
        </span>

        <span className={styles.heroSub}>
          {typeLabel} {when}
        </span>

        {transaction.status !== 'completed' ? (
          <span className={cn(styles.status, styles[transaction.status])}>
            {i18n._(STATUS_LABELS[transaction.status])}
          </span>
        ) : null}
      </div>

      {transaction.status === 'failed' && transaction.failureReason ? (
        <p className={styles.notice}>
          {i18n._(FAILURE_REASONS[transaction.failureReason])}
        </p>
      ) : null}

      {transaction.status === 'pending' ? (
        <p className={styles.notice}>
          {isDeposit
            ? t`The deposit will be credited after network confirmation, usually within a minute.`
            : t`Withdrawals are processed within a few minutes. The amount is already reserved from your balance.`}
        </p>
      ) : null}

      <div className={styles.card}>
        <button
          type="button"
          className={styles.addressRow}
          onClick={() => void copy(transaction.address).catch(() => {})}
        >
          <span className={styles.label}>
            {isDeposit ? t`Sender address` : t`Recipient address`}
            {copied ? (
              <span className={styles.copied}>
                <Check size={13} strokeWidth={3} />
                {t`Copied`}
              </span>
            ) : null}
          </span>
          <span className={styles.address}>{transaction.address}</span>
        </button>

        {transaction.fee != null ? (
          <div className={styles.row}>
            <span className={styles.label}>{t`Fee`}</span>
            <span className={styles.value}>{ton(transaction.fee)}</span>
          </div>
        ) : null}
      </div>

      {transaction.txHash ? (
        <div className={styles.footer}>
          <a
            className={styles.txPill}
            // Encoded: the hash comes from the server and must stay one path
            // segment on tonviewer.com (no `../` or `?` tricks).
            href={`https://tonviewer.com/transaction/${encodeURIComponent(transaction.txHash)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={18} />
            {t`Transaction`}
            <span className={styles.txHash}>
              {transaction.txHash.slice(0, 8)}
            </span>
          </a>
        </div>
      ) : null}
    </Dialog>
  );
};
