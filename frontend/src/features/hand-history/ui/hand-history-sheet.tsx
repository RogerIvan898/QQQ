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
  /** Opens a hand for replay. */
  onSelect: (hand: HandRecord) => void;
}

/** Same breakpoint as the bottom-sheet layout in the CSS module. */
const SHEET_QUERY =
  '(max-width: 768px), (orientation: portrait) and (max-width: 1100px)';

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
  const isSheet = useMediaQuery(SHEET_QUERY);
  // Phones: swipe the sheet down by its handle or header to hide it.
  const swipe = useSwipeToClose(onClose, isSheet);
  const resetSwipe = React.useEffectEvent(() => swipe.reset());

  const presence = usePresence(open);

  // The sheet stays mounted while closed, so a swipe-close would leave its
  // drag offset behind and the next open would start pushed down. Cleared
  // once the exit animation is over, so the slide-out starts from the finger.
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
