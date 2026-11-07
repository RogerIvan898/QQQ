import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

import { useTelegramBackButton } from 'shared/lib/telegram';

import styles from './history-page.module.css';
import { TransactionsTab } from './transactions-tab';

export const HistoryPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  useTelegramBackButton(() => void navigate({ to: '/' }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backBtn} aria-label={t`Back`}>
          <ChevronLeft size={26} />
        </Link>
        <h1 className={styles.title}>{t`History`}</h1>
      </header>

      <TransactionsTab />
    </div>
  );
};
