import type { CSSProperties, ReactNode } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { cn } from 'shared/utils/cn';
import { formatBalance } from 'shared/utils/format';

import {
  roomBigBlind,
  roomTier,
  type RoomCardInfo,
  type RoomGame,
} from '../../model';

import styles from './room-card.module.css';

const GAME_LABELS = {
  nlh: msg`NL Hold'em`,
} as const satisfies Record<RoomGame, ReturnType<typeof msg>>;

const CURRENCY = 'TON';

interface Props {
  room: RoomCardInfo;
  action: ReactNode;

  index?: number;
}

export const RoomCard = ({ room, action, index = 0 }: Props) => {
  const { i18n, t } = useLingui();
  const isFull = room.players >= room.max;
  const tier = roomTier(roomBigBlind(room));
  const format = room.mode === 'heads-up' ? t`Heads-Up` : `${room.max}-max`;

  return (
    <article
      className={cn(styles.card, styles[tier], isFull && styles.cardFull)}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
    >
      <div className={styles.info}>
        <div className={styles.heading}>
          <div className={styles.titleBlock}>
            <h3 className={styles.name}>{room.name}</h3>
            <span className={styles.game}>
              {i18n._(GAME_LABELS[room.game ?? 'nlh'])}
              <span className={styles.dot} aria-hidden="true" />
              {format}
            </span>
          </div>
        </div>

        <dl className={styles.meta}>
          <div className={styles.metaItem}>
            <dt>{t`Blinds`}</dt>
            <dd>
              {room.blinds}
              <span className={styles.currency}>{CURRENCY}</span>
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>{t`Buy-in`}</dt>
            <dd>
              {formatBalance(room.minBuy, i18n.locale)}–
              {formatBalance(room.maxBuy, i18n.locale)}
              <span className={styles.currency}>{CURRENCY}</span>
            </dd>
          </div>
        </dl>

        <div className={styles.statusRow}>
          <span
            className={styles.seats}
            role="img"
            aria-label={t`${room.players} of ${room.max} seats taken`}
          >
            {Array.from({ length: room.max }, (_, seat) => (
              <span
                key={seat}
                className={cn(
                  styles.seat,
                  seat < room.players && styles.seatTaken
                )}
              />
            ))}
          </span>
          <span className={styles.players}>
            {room.players}/{room.max}
          </span>
        </div>
      </div>

      <div className={styles.action}>{action}</div>
    </article>
  );
};
