import React from 'react';

import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Ellipsis,
  Inbox,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react';

import {
  STATUS_LABELS,
  walletModel,
  type Transaction,
  type TransactionType,
} from 'entities/wallet';
import { cn } from 'shared/utils/cn';
import { formatBalance } from 'shared/utils/format';

import { TransactionDetails } from './transaction-details';
import styles from './wallet-panel.module.css';

interface RowProps {
  transaction: Transaction;
  onSelect: (transaction: Transaction) => void;
}

const TransactionRow = ({ transaction, onSelect }: RowProps) => {
  const { i18n, t } = useLingui();
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
  const when = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(transaction.createdAt));

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
            isFailed
              ? styles.iconFailed
              : isPending
                ? styles.iconPending
                : isDeposit
                  ? styles.iconDeposit
                  : styles.iconWithdrawal
          )}
        >
          <Icon size={18} strokeWidth={2.5} />
        </span>

        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>
            {isDeposit
              ? t({ message: 'Deposit', context: 'transaction' })
              : t({ message: 'Withdrawal', context: 'transaction' })}
          </span>
          <span className={styles.rowSub}>{when}</span>
        </span>

        <span className={styles.rowSide}>
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
          <span className={cn(styles.status, styles[transaction.status])}>
            {i18n._(STATUS_LABELS[transaction.status])}
          </span>
        </span>

        <ChevronRight size={16} className={styles.chevron} />
      </button>
    </li>
  );
};

const FILTERS = [
  [null, msg`All`],
  ['deposit', msg`Deposits`],
  ['withdrawal', msg`Withdrawals`],
] as const satisfies readonly (readonly [
  TransactionType | null,
  MessageDescriptor,
])[];

const DAY_MS = 86_400_000;

const startOfDay = (iso: string) => {
  const date = new Date(iso);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
};

const groupByDay = (items: Transaction[]) => {
  const groups: { day: number; items: Transaction[] }[] = [];

  for (const item of items) {
    const day = startOfDay(item.createdAt);
    const last = groups[groups.length - 1];

    if (last?.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, items: [item] });
    }
  }

  return groups;
};

export const TransactionsList = () => {
  const { i18n, t } = useLingui();
  const [typeFilter, changeFilter] = useUnit([
    walletModel.$typeFilter,
    walletModel.typeFilterChanged,
  ]);
  const [items, hasMore, loading, initialLoad, error, requestNext, retry] =
    useUnit([
      walletModel.$transactions,
      walletModel.$hasMore,
      walletModel.$isLoadingPage,
      walletModel.$isInitialLoad,
      walletModel.$transactionsError,
      walletModel.nextPageRequested,
      walletModel.retryRequested,
    ]);
  const [selected, setSelected] = React.useState<Transaction | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore || error) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          requestNext();
        }
      },
      { rootMargin: '0px 0px 160px 0px' }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, error, requestNext, items.length]);

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const dayLabel = (day: number) =>
    day === todayStart
      ? t`Today`
      : day === todayStart - DAY_MS
        ? t`Yesterday`
        : new Intl.DateTimeFormat(i18n.locale, {
            day: 'numeric',
            month: 'long',
          }).format(day);

  const renderBody = () => {
    if (initialLoad) {
      return (
        <div className={styles.state}>
          <Loader2 size={24} className={styles.spin} />
          <span>{t`Loading transactions…`}</span>
        </div>
      );
    }

    if (items.length === 0 && error) {
      return (
        <div className={styles.state}>
          <AlertCircle size={28} strokeWidth={1.75} />
          <span>{t`Couldn't load transactions`}</span>
          <button type="button" className={styles.retryBtn} onClick={retry}>
            <RotateCw size={14} />
            {t`Try again`}
          </button>
        </div>
      );
    }

    if (items.length === 0 && !hasMore) {
      return (
        <div className={styles.state}>
          <Inbox size={32} strokeWidth={1.5} />
          <span>{t`No transactions yet`}</span>
        </div>
      );
    }

    return (
      <>
        {groupByDay(items).map(group => (
          <section key={group.day} className={styles.dayGroup}>
            <h4 className={styles.dayTitle}>{dayLabel(group.day)}</h4>
            <ul className={styles.rows}>
              {group.items.map(transaction => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  onSelect={setSelected}
                />
              ))}
            </ul>
          </section>
        ))}

        <div ref={sentinelRef} className={styles.footer}>
          {loading ? (
            <Loader2
              size={20}
              className={styles.spin}
              aria-label={t`Loading`}
            />
          ) : error ? (
            <button type="button" className={styles.retryBtn} onClick={retry}>
              <RotateCw size={14} />
              {t`Couldn't load more. Try again`}
            </button>
          ) : null}
        </div>

        <TransactionDetails
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      </>
    );
  };

  return (
    <>
      <div className={styles.filters} role="tablist">
        {FILTERS.map(([type, label]) => (
          <button
            key={type ?? 'all'}
            type="button"
            role="tab"
            aria-selected={typeFilter === type}
            className={cn(
              styles.filter,
              typeFilter === type && styles.filterActive
            )}
            onClick={() => {
              if (typeFilter !== type) {
                changeFilter(type);
              }
            }}
          >
            {i18n._(label)}
          </button>
        ))}
      </div>
      {renderBody()}
    </>
  );
};
