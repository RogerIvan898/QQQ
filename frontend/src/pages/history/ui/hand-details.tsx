import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Trophy } from 'lucide-react';

import { MiniCard } from 'entities/card';
import type { GameStreet } from 'entities/game';
import type { HandRecord } from 'features/hand-history';
import { Dialog } from 'shared/ui/dialog';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import { formatNet } from '../lib/format-net';

import styles from './hand-details.module.css';

type HandActionType = HandRecord['actions'][number]['action'];

const ACTION_LABELS = {
  SB: msg`Small blind`,
  BB: msg`Big blind`,
  FOLD: msg`Fold`,
  CHECK: msg`Check`,
  CALL: msg`Call`,
  BET: msg`Bet`,
  RAISE: msg`Raise`,
} as const satisfies Record<HandActionType, MessageDescriptor>;

const STREET_LABELS: Partial<Record<GameStreet, MessageDescriptor>> = {
  PREFLOP: msg`Preflop`,
  FLOP: msg`Flop`,
  TURN: msg`Turn`,
  RIVER: msg`River`,
};

const STREET_ORDER: GameStreet[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

interface Props {
  hand: HandRecord | null;
  onClose: () => void;
}

export const HandDetails = ({ hand, onClose }: Props) => {
  const { i18n, t } = useLingui();

  if (!hand) {
    return null;
  }

  const when = new Intl.DateTimeFormat(i18n.locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(hand.startedAt));
  const table = hand.roomId ? t`Table #${hand.roomId}` : t`Table`;
  const blinds = `${formatCompactNumber(hand.smallBlind)}/${formatCompactNumber(hand.bigBlind)}`;
  const streets = STREET_ORDER.map(street => ({
    street,
    actions: hand.actions.filter(action => action.street === street),
  })).filter(group => group.actions.length > 0);
  const opponentsShown = hand.seats.filter(seat => !seat.isMe && seat.cards);

  return (
    <Dialog open variant="bottom" onClose={onClose}>
      <div className={styles.hero}>
        <div className={styles.heroCards}>
          {hand.myCards ? (
            hand.myCards.map((card, index) => (
              <MiniCard key={index} card={card} size="md" />
            ))
          ) : (
            <>
              <MiniCard card={null} size="md" />
              <MiniCard card={null} size="md" />
            </>
          )}
        </div>

        <span
          className={cn(
            styles.net,
            hand.net > 0 && styles.netPositive,
            hand.net < 0 && styles.netNegative
          )}
        >
          {formatNet(hand.net)}
        </span>
        <span className={styles.sub}>
          {table} · {blinds} · {when}
        </span>
      </div>

      <section className={styles.card}>
        <div className={styles.cardRow}>
          <span className={styles.label}>{t`Board`}</span>
          <div className={styles.cards}>
            {hand.board.length > 0 ? (
              hand.board.map((card, index) => (
                <MiniCard key={index} card={card} />
              ))
            ) : (
              <span className={styles.muted}>{t`Not dealt`}</span>
            )}
          </div>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.label}>{t`Pot`}</span>
          <span className={styles.value}>{formatCompactNumber(hand.pot)}</span>
        </div>
      </section>

      {hand.winners.length > 0 ? (
        <section className={styles.card}>
          {hand.winners.map(winner => (
            <div key={winner.seat} className={styles.cardRow}>
              <span className={styles.winner}>
                <Trophy size={15} className={styles.trophy} />
                <span className={cn(winner.isMe && styles.me)}>
                  {winner.isMe ? t`You` : winner.name}
                </span>
                {winner.combination ? (
                  <span className={styles.muted}>{winner.combination}</span>
                ) : null}
              </span>
              <span className={cn(styles.value, styles.netPositive)}>
                +{formatCompactNumber(winner.amount)}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {opponentsShown.length > 0 ? (
        <section className={styles.card}>
          {opponentsShown.map(seat => (
            <div key={seat.seat} className={styles.cardRow}>
              <span>{seat.name}</span>
              <div className={styles.cards}>
                {seat.cards?.map((card, index) => (
                  <MiniCard key={index} card={card} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <h3 className={styles.sectionTitle}>{t`Hand log`}</h3>
      <section className={styles.card}>
        {streets.map(({ street, actions }) => (
          <div key={street} className={styles.street}>
            <span className={styles.streetTitle}>
              {i18n._(STREET_LABELS[street] ?? msg`Preflop`)}
            </span>
            <ul className={styles.actions}>
              {actions.map((action, index) => (
                <li key={index} className={styles.action}>
                  <span className={cn(action.isMe && styles.me)}>
                    {action.isMe ? t`You` : action.name}
                  </span>
                  <span className={styles.actionWhat}>
                    {i18n._(ACTION_LABELS[action.action])}
                    {action.amount ? (
                      <b> {formatCompactNumber(action.amount)}</b>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </Dialog>
  );
};
