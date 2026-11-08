import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ChevronRight, Spade, X } from 'lucide-react';

import { MiniCard } from 'entities/card';
import { useDismiss } from 'shared/hooks/use-dismiss';
import { useMediaQuery } from 'shared/hooks/use-media-query';
import { usePresence } from 'shared/hooks/use-presence';
import { useSwipeToClose } from 'shared/hooks/use-swipe-to-close';
import { cn } from 'shared/utils/cn';

import { formatNet } from '../lib/format-net';
import { $hands, type HandRecord } from '../model';

import styles from './hand-history-sheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;

  onSelect: (hand: HandRecord) => void;
}

const SHEET_QUERY =
  '(max-width: 768px), (orientation: portrait) and (max-width: 1100px)';

export const HAND_HISTORY_TOGGLE_ATTR = 'data-hand-history-toggle';

export const HandHistorySheet = ({ open, onClose, onSelect }: Props) => {
  const { i18n, t } = useLingui();
  const hands = useUnit($hands);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const isSheet = useMediaQuery(SHEET_QUERY);

  const swipe = useSwipeToClose(onClose, isSheet);
  const resetSwipe = React.useEffectEvent(() => swipe.reset());

  const presence = usePresence(open);

  React.useEffect(() => {
    if (!presence.mounted) {
      resetSwipe();
    }
  }, [presence.mounted]);
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

  if (!presence.mounted) {
    return null;
  }

  return (
    <section
      ref={panelRef}
      className={cn(
        styles.panel,
        swipe.dragging && styles.dragging,
        presence.closing && styles.closing
      )}
      style={
        swipe.dragging
          ? { transform: `translateY(${swipe.offset}px)` }
          : undefined
      }
      aria-label={t`Hand history`}
    >
      <div className={styles.grabber} aria-hidden="true" {...swipe.handlers}>
        <span className={styles.grabberBar} />
      </div>
      <header className={styles.header} {...swipe.handlers}>
        <span className={styles.heading}>{t`Hand history`}</span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          onPointerDown={event => event.stopPropagation()}
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
