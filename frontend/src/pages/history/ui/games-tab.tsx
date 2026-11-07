import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ChevronRight, Spade } from 'lucide-react';

import { MiniCard } from 'entities/card';
import { handHistoryModel, type HandRecord } from 'features/hand-history';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import { groupByDay, useDayLabel, useTimeFormat } from '../lib/day-groups';
import { formatNet } from '../lib/format-net';

import { HandDetails } from './hand-details';
import styles from './history-page.module.css';

interface RowProps {
  hand: HandRecord;
  onSelect: (hand: HandRecord) => void;
}

const HandRow = ({ hand, onSelect }: RowProps) => {
  const { t } = useLingui();
  const formatTime = useTimeFormat();
  const myWin = hand.winners.find(winner => winner.isMe);

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => onSelect(hand)}
      >
        <span className={styles.handCards}>
          {hand.myCards ? (
            hand.myCards.map((card, index) => (
              <MiniCard key={index} card={card} />
            ))
          ) : (
            <>
              <MiniCard card={null} />
              <MiniCard card={null} />
            </>
          )}
        </span>

        <div className={styles.rowMain}>
          <span className={styles.rowTitle}>
            {hand.roomId ? t`Table #${hand.roomId}` : t`Table`}
          </span>
          <span className={styles.rowSub}>
            {formatTime(hand.startedAt)}
            <span className={styles.txHash}>
              {formatCompactNumber(hand.smallBlind)}/
              {formatCompactNumber(hand.bigBlind)}
            </span>
          </span>
        </div>

        <div className={styles.rowSide}>
          <span
            className={cn(styles.amount, hand.net > 0 && styles.amountPositive)}
          >
            {formatNet(hand.net)}
          </span>
          {myWin?.combination ? (
            <span className={styles.combination}>{myWin.combination}</span>
          ) : null}
        </div>

        <ChevronRight size={18} className={styles.chevron} />
      </button>
    </li>
  );
};

export const GamesTab = () => {
  const { t } = useLingui();
  const dayLabel = useDayLabel();
  const hands = useUnit(handHistoryModel.$hands);
  const [selected, setSelected] = React.useState<HandRecord | null>(null);
  const groups = groupByDay(hands, hand => hand.startedAt);

  return (
    <>
      <div className={styles.list}>
        {groups.length === 0 ? (
          <div className={styles.empty}>
            <Spade size={36} strokeWidth={1.5} />
            <span>{t`No hands played yet`}</span>
          </div>
        ) : (
          groups.map(([day, dayHands]) => (
            <section key={day} className={styles.group}>
              <h2 className={styles.groupTitle}>{dayLabel(day)}</h2>
              <ul className={styles.rows}>
                {dayHands.map(hand => (
                  <HandRow key={hand.id} hand={hand} onSelect={setSelected} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <HandDetails hand={selected} onClose={() => setSelected(null)} />
    </>
  );
};
