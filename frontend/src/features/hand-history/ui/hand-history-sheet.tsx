import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { ChevronLeft, ChevronRight, Spade } from 'lucide-react';

import { MiniCard } from 'entities/card';
import { Dialog, DialogHeaderButton } from 'shared/ui/dialog';
import { cn } from 'shared/utils/cn';

import { formatNet } from '../lib/format-net';
import { $hands, type HandRecord } from '../model';

import styles from './hand-history-sheet.module.css';
import { HandReplayer } from './hand-replayer';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Hands played at the current table, with a step-by-step replayer. */
export const HandHistorySheet = ({ open, onClose }: Props) => {
  const { i18n, t } = useLingui();
  const hands = useUnit($hands);
  const [selected, setSelected] = React.useState<HandRecord | null>(null);
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const close = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      variant="bottom"
      onClose={close}
      title={
        selected
          ? t`Hand at ${time.format(new Date(selected.startedAt))}`
          : t`Hand history`
      }
      leading={
        selected ? (
          <DialogHeaderButton
            onClick={() => setSelected(null)}
            ariaLabel={t`Back`}
          >
            <ChevronLeft size={18} />
          </DialogHeaderButton>
        ) : undefined
      }
    >
      {selected ? (
        <HandReplayer key={selected.id} hand={selected} />
      ) : hands.length === 0 ? (
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
                  onClick={() => setSelected(hand)}
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
                      {myWin?.combination ?? hand.winners[0]?.combination ?? ''}
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
    </Dialog>
  );
};
