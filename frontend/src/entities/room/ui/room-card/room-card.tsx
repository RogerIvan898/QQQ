import type { ReactNode } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Coins, Swords, Users } from 'lucide-react';

import { cn } from 'shared/utils/cn';
import { formatBalance } from 'shared/utils/format';

import type { RoomCardInfo, RoomMode } from '../../model';

import styles from './room-card.module.css';

const MODE_LABELS = {
  cash: msg`Cash`,
  'heads-up': msg`Heads-Up`,
} as const satisfies Record<RoomMode, ReturnType<typeof msg>>;

const CURRENCY = 'TON';

interface Props {
  room: RoomCardInfo;
  action: ReactNode;
  /** TON the player is missing for the minimum buy-in; 0 when affordable. */
  shortfall?: number;
}

export const RoomCard = ({ room, action, shortfall = 0 }: Props) => {
  const { i18n, t } = useLingui();
  const isFull = room.players >= room.max;
  const isLocked = !isFull && shortfall > 0;
  const isHeadsUp = room.mode === 'heads-up';
  const occupancy = Math.min(100, (room.players / room.max) * 100);
  const missing = `${formatBalance(shortfall, i18n.locale)} ${CURRENCY}`;

  return (
    <article
      className={cn(
        styles.card,
        isFull && styles.cardFull,
        isLocked && styles.cardLocked
      )}
    >
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 className={styles.name}>{room.name}</h3>
          <span
            className={cn(
              styles.badge,
              isHeadsUp ? styles.badgeHeadsUp : styles.badgeCash
            )}
          >
            {isHeadsUp ? (
              <Swords size={11} strokeWidth={2.5} />
            ) : (
              <Coins size={11} strokeWidth={2.5} />
            )}
            {i18n._(MODE_LABELS[room.mode])}
          </span>
        </div>

        <dl className={styles.meta}>
          <div className={styles.metaItem}>
            <dt>{t`Blinds`}</dt>
            <dd>
              {room.blinds} {CURRENCY}
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>{t`Min buy-in`}</dt>
            <dd>
              {formatBalance(room.minBuy, i18n.locale)} {CURRENCY}
            </dd>
          </div>
        </dl>

        <div className={styles.statusRow}>
          <span className={styles.players}>
            <Users size={14} />
            {room.players}/{room.max}
          </span>
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

        {isLocked ? (
          <span className={styles.shortfall}>{t`Need ${missing} more`}</span>
        ) : null}
      </div>

      <div className={styles.action}>{action}</div>
    </article>
  );
};
