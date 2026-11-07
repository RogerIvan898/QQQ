import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ChevronRight, Spade, X } from 'lucide-react';

import { MiniCard } from 'entities/card';
import { useDismiss } from 'shared/hooks/use-dismiss';
import { cn } from 'shared/utils/cn';

import { formatNet } from '../lib/format-net';
import { $hands, type HandRecord } from '../model';

import styles from './hand-history-sheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Opens a hand for replay. */
  onSelect: (hand: HandRecord) => void;
}

/** Clicks on the button that toggles the panel must not count as "outside". */
export const HAND_HISTORY_TOGGLE_ATTR = 'data-hand-history-toggle';

/**
 * Hands played at the current table, as a dropdown under the history button:
 * no backdrop, so the live table stays visible and playable while browsing.
 * Closes on an outside click or Escape.
 */
export const HandHistorySheet = ({ open, onClose, onSelect }: Props) => {
  const { i18n, t } = useLingui();
  const hands = useUnit($hands);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  useDismiss({
    enabled: open,
    insideRefs: [panelRef],
    keepOpenSelector: `[${HAND_HISTORY_TOGGLE_ATTR}]`,
    onDismiss: onClose,
  });

  if (!open) {
    return null;
  }

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      aria-label={t`Hand history`}
    >
      <header className={styles.header}>
        <span className={styles.heading}>{t`Hand history`}</span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t`Close`}
        >
          <X size={16} />
        </button>
      </header>
      <div className={styles.body}>
        {hands.length === 0 ? (
          <div className={styles.empty}>
            <Spade size={36} strokeWidth={1.5} />
            <span>{t`No hands at this table yet`}</span>
          </div>
        ) : (
          <ul className={styles.list}>
            {hands.map(hand => {
              const myWin = hand.winners.find(winner => winner.isMe);

              return (
                <li key={hand.id}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => onSelect(hand)}
                  >
                    <span className={styles.cards}>
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
                    <span className={styles.main}>
                      <span className={styles.title}>
                        {time.format(new Date(hand.startedAt))}
                      </span>
                      <span className={styles.sub}>
                        {myWin?.combination ??
                          hand.winners[0]?.combination ??
                          ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        styles.net,
                        hand.net > 0 && styles.netPositive
                      )}
                    >
                      {formatNet(hand.net)}
                    </span>
                    <ChevronRight size={18} className={styles.chevron} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
