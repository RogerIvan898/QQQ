import type { ReactNode } from 'react';

import { msg } from '@lingui/core/macro';
import { Plural, useLingui } from '@lingui/react/macro';
import { Coins, Swords, Users } from 'lucide-react';

import { cn } from 'shared/utils/cn';

import type { RoomCardInfo, RoomMode } from '../../model';

import styles from './room-card.module.css';

const MODE_LABELS = {
  cash: msg`Cash`,
  'heads-up': msg`Heads-Up`,
} as const satisfies Record<RoomMode, ReturnType<typeof msg>>;

interface Props {
  room: RoomCardInfo;
  action: ReactNode;
}

export const RoomCard = ({ room, action }: Props) => {
  const { i18n, t } = useLingui();
  const isFull = room.players >= room.max;
  const occupancy = Math.min(100, (room.players / room.max) * 100);
  const isHeadsUp = room.mode === 'heads-up';

  return (
    <article className={cn(styles.card, isFull && styles.cardFull)}>
      <div className={styles.header}>
        <h3 className={styles.name}>{room.name}</h3>
        <div
          className={cn(
            styles.badge,
            isHeadsUp ? styles.badgeHeadsUp : styles.badgeCash
          )}
        >
          {isHeadsUp ? (
            <Swords size={12} strokeWidth={2.5} />
          ) : (
            <Coins size={12} strokeWidth={2.5} />
          )}
          <span>{i18n._(MODE_LABELS[room.mode])}</span>
        </div>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t`Blinds`}</span>
          <span className={styles.metaValue}>{room.blinds}</span>
        </div>
        <div className={styles.metaDivider} />
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>{t`Min buy-in`}</span>
          <span className={styles.metaValue}>{room.minBuy}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.playersSection}>
          <div
            className={cn(styles.playersCount, isFull && styles.playersFull)}
          >
            <Users size={16} className={styles.usersIcon} />
            <span>
              {room.players} / {room.max}{' '}
              <Plural value={room.max} one="player" other="players" />
            </span>
          </div>

          <div className={styles.occupancy}>
            <div
              className={cn(
                styles.occupancyFill,
                isFull && styles.occupancyFull
              )}
              style={{ width: `${occupancy}%` }}
            />
          </div>
        </div>

        <div className={styles.action}>{action}</div>
      </div>
    </article>
  );
};
