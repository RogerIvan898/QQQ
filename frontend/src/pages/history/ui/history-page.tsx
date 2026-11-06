import React from 'react';

import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ExternalLink,
  Inbox,
} from 'lucide-react';

import { cn } from 'shared/utils/cn';
import { formatBalance, truncateMiddle } from 'shared/utils/format';

import {
  filterTransactions,
  HISTORY_FILTERS,
  historyFilterLabel,
  MOCK_TRANSACTIONS,
  type HistoryFilter,
  type Transaction,
  type TransactionStatus,
} from '../model';

import styles from './history-page.module.css';

const STATUS_LABELS = {
  completed: msg`Completed`,
  pending: msg`Pending`,
  failed: msg`Failed`,
} as const satisfies Record<TransactionStatus, MessageDescriptor>;

const DAY_MS = 86_400_000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Groups transactions (already newest-first) by calendar day. */
const groupByDay = (transactions: Transaction[]) => {
  const groups = new Map<number, Transaction[]>();

  for (const transaction of transactions) {
    const day = startOfDay(new Date(transaction.createdAt));
    const group = groups.get(day);

    if (group) {
      group.push(transaction);
    } else {
      groups.set(day, [transaction]);
    }
  }

  return [...groups.entries()];
};

interface RowProps {
  transaction: Transaction;
}

const TransactionRow = ({ transaction }: RowProps) => {
  const { i18n, t } = useLingui();
  const isDeposit = transaction.type === 'deposit';
  const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(transaction.createdAt));

  return (
    <li className={styles.row}>
      <span
        className={cn(
          styles.icon,
          isDeposit ? styles.iconDeposit : styles.iconWithdrawal
        )}
      >
        <Icon size={18} strokeWidth={2.5} />
      </span>

      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {isDeposit
            ? t({ message: 'Deposit', context: 'transaction' })
            : t({ message: 'Withdrawal', context: 'transaction' })}
        </span>
        <span className={styles.rowSub}>
          {time}
          {transaction.txHash ? (
            <a
              className={styles.txLink}
              href={`https://tonviewer.com/transaction/${transaction.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {truncateMiddle(transaction.txHash, 4)}
              <ExternalLink size={11} />
            </a>
          ) : null}
        </span>
      </div>

      <div className={styles.rowSide}>
        <span
          className={cn(
            styles.amount,
            isDeposit && styles.amountDeposit,
            transaction.status === 'failed' && styles.amountFailed
          )}
        >
          {isDeposit ? '+' : '−'}
          {formatBalance(transaction.amount, i18n.locale)} TON
        </span>
        {transaction.status !== 'completed' ? (
          <span className={cn(styles.status, styles[transaction.status])}>
            {i18n._(STATUS_LABELS[transaction.status])}
          </span>
        ) : null}
      </div>
    </li>
  );
};

export const HistoryPage = () => {
  const { i18n, t } = useLingui();
  const [filter, setFilter] = React.useState<HistoryFilter>('all');
  const groups = groupByDay(filterTransactions(MOCK_TRANSACTIONS, filter));
  const today = startOfDay(new Date());

  const dayLabel = (day: number) => {
    if (day === today) {
      return t`Today`;
    }

    if (day === today - DAY_MS) {
      return t`Yesterday`;
    }

    return new Intl.DateTimeFormat(i18n.locale, {
      day: 'numeric',
      month: 'long',
    }).format(day);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backBtn} aria-label={t`Back`}>
          <ChevronLeft size={26} />
        </Link>
        <h1 className={styles.title}>{t`History`}</h1>
      </header>

      <div className={styles.tabs}>
        {HISTORY_FILTERS.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={cn(styles.tab, filter === item && styles.tabActive)}
          >
            {i18n._(historyFilterLabel(item))}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {groups.length === 0 ? (
          <div className={styles.empty}>
            <Inbox size={36} strokeWidth={1.5} />
            <span>{t`No transactions yet`}</span>
          </div>
        ) : (
          groups.map(([day, transactions]) => (
            <section key={day} className={styles.group}>
              <h2 className={styles.groupTitle}>{dayLabel(day)}</h2>
              <ul className={styles.rows}>
                {transactions.map(transaction => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
};
