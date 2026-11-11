import type React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Coins, Swords } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import { ROOM_FILTERS, roomFilterLabel, type RoomFilter } from '../model';

import styles from './main-menu.module.css';

interface FiltersProps {
  active: RoomFilter;
  onChange: (filter: RoomFilter) => void;
}

const FILTER_ICONS = {
  cash: Coins,
  'heads-up': Swords,
} as const;

export const Filters = ({ active, onChange }: FiltersProps) => {
  const { i18n } = useLingui();

  return (
    <div className={styles.tabsContainer}>
      <div
        className={styles.tabsScroll}
        style={
          {
            '--tab-index': Math.max(0, ROOM_FILTERS.indexOf(active)),
            '--tab-count': ROOM_FILTERS.length,
          } as React.CSSProperties
        }
      >
        <span className={styles.tabIndicator} aria-hidden="true" />
        {ROOM_FILTERS.map(filter => {
          const Icon = filter === 'all' ? null : FILTER_ICONS[filter];

          return (
            <button
              key={filter}
              type="button"
              onClick={() => onChange(filter)}
              className={cn(
                styles.tabItem,
                active === filter && styles.activeTab
              )}
            >
              {Icon ? <Icon size={15} strokeWidth={2.25} /> : null}
              {i18n._(roomFilterLabel(filter))}
            </button>
          );
        })}
      </div>
    </div>
  );
};
