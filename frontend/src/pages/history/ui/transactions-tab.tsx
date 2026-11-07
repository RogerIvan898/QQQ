import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Inbox } from 'lucide-react';

import { cn } from 'shared/utils/cn';
import { formatBalance, truncateMiddle } from 'shared/utils/format';

import { groupByDay, useDayLabel, useTimeFormat } from '../lib/day-groups';
import {
  filterTransactions,
  HISTORY_FILTERS,
  historyFilterLabel,
  MOCK_TRANSACTIONS,
  STATUS_LABELS,
  type HistoryFilter,
  type Transaction,
} from '../model';

import styles from './history-page.module.css';
import { TransactionDetails } from './transaction-details';

interface RowProps {
  transaction: Transaction;
  onSelect: (transaction: Transaction) => void;
}

const TransactionRow = ({ transaction, onSelect }: RowProps) => {
  const { i18n, t } = useLingui();
  const formatTime = useTimeFormat();
  const isDeposit = transaction.type === 'deposit';
  const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => onSelect(transaction)}
      >
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
            {formatTime(transaction.createdAt)}
            {transaction.txHash ? (
              <span className={styles.txHash}>
                {truncateMiddle(transaction.txHash, 4)}
              </span>
            ) : null}
          </span>
        </div>

        <div className={styles.rowSide}>
          <span
            className={cn(
              styles.amount,
              isDeposit && styles.amountPositive,
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

        <ChevronRight size={18} className={styles.chevron} />
      </button>
    </li>
  );
};

export const TransactionsTab = () => {
  const { i18n, t } = useLingui();
  const dayLabel = useDayLabel();
  const [filter, setFilter] = React.useState<HistoryFilter>('all');
  const [selected, setSelected] = React.useState<Transaction | null>(null);
  const groups = groupByDay(
    filterTransactions(MOCK_TRANSACTIONS, filter),
    transaction => transaction.createdAt
  );

  return (
    <>
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
                    onSelect={setSelected}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <TransactionDetails
        transaction={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
};
