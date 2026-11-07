import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

import { useTelegramBackButton } from 'shared/lib/telegram';
import { cn } from 'shared/utils/cn';

import { GamesTab } from './games-tab';
import styles from './history-page.module.css';
import { TransactionsTab } from './transactions-tab';

type Section = 'games' | 'transactions';

export const HistoryPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [section, setSection] = React.useState<Section>('games');
  useTelegramBackButton(() => void navigate({ to: '/' }));
  const sections: { id: Section; label: string }[] = [
    { id: 'games', label: t`Games` },
    { id: 'transactions', label: t`Transactions` },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backBtn} aria-label={t`Back`}>
          <ChevronLeft size={26} />
        </Link>
        <h1 className={styles.title}>{t`History`}</h1>
      </header>

      <div className={styles.segments} role="tablist">
        {sections.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              styles.segment,
              section === item.id && styles.segmentActive
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'games' ? <GamesTab /> : <TransactionsTab />}
    </div>
  );
};
