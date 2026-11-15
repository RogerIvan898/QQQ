import { useLingui } from '@lingui/react/macro';
import { Coins, Swords } from 'lucide-react';

import type { GameVariant } from 'shared/config/game-variant';
import { ChipGroup } from 'shared/ui/chip-group';

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

const GAME_VARIANTS: readonly GameVariant[] = ['nlh', 'plo'];

export const Filters = ({ active, onChange }: FiltersProps) => {
  const { i18n, t } = useLingui();
  const items = ROOM_FILTERS.map(filter => {
    const Icon = filter === 'all' ? null : FILTER_ICONS[filter];

    return {
      id: filter,
      label: (
        <>
          {Icon ? <Icon size={15} strokeWidth={2.25} /> : null}
          {i18n._(roomFilterLabel(filter))}
        </>
      ),
    };
  });

  return (
    <div className={styles.formatControl}>
      <span className={styles.filterLabel}>{t`Format`}</span>
      <ChipGroup
        items={items}
        value={active}
        onChange={onChange}
        label={t`Format`}
        className={styles.chipGroup}
      />
    </div>
  );
};

interface GameVariantToggleProps {
  active: GameVariant;
  onChange: (variant: GameVariant) => void;
}

export const GameVariantToggle = ({
  active,
  onChange,
}: GameVariantToggleProps) => {
  const { t } = useLingui();
  const items = GAME_VARIANTS.map(variant => ({
    id: variant,
    label: variant === 'nlh' ? t`NL Hold'em` : t`PL Omaha`,
  }));

  return (
    <div className={styles.variantControl}>
      <span className={styles.filterLabel}>{t`Game Type`}</span>
      <ChipGroup
        items={items}
        value={active}
        onChange={onChange}
        label={t`Game Type`}
        className={styles.chipGroup}
      />
    </div>
  );
};
