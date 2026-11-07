import React from 'react';

import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Trophy,
} from 'lucide-react';

import { MiniCard } from 'entities/card';
import type { GameStreet } from 'entities/game';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import { buildTimeline, replayState, type ReplaySeat } from '../lib/replay';
import type { HandAction, HandRecord } from '../model';

import styles from './hand-replayer.module.css';

const AUTOPLAY_MS = 1100;

const ACTION_LABELS = {
  SB: msg`Small blind`,
  BB: msg`Big blind`,
  FOLD: msg`Fold`,
  CHECK: msg`Check`,
  CALL: msg`Call`,
  BET: msg`Bet`,
  RAISE: msg`Raise`,
} as const satisfies Record<HandAction['action'], MessageDescriptor>;

const STREET_LABELS: Partial<Record<GameStreet, MessageDescriptor>> = {
  PREFLOP: msg`Preflop`,
  FLOP: msg`Flop`,
  TURN: msg`Turn`,
  RIVER: msg`River`,
  SHOWDOWN: msg`Showdown`,
};

const toRadians = (index: number, count: number) =>
  ((90 + (index * 360) / count) * Math.PI) / 180;

/** Seats around an ellipse, the player always at the bottom. */
const seatPosition = (index: number, count: number) => {
  const angle = toRadians(index, count);

  return {
    left: `${50 + 36 * Math.cos(angle)}%`,
    top: `${50 + 38 * Math.sin(angle)}%`,
  };
};

/**
 * Bet chips sit between the seat and the center. Side seats share the board's
 * row, so their chips drop below it instead of covering the cards.
 */
const betPosition = (index: number, count: number) => {
  const angle = toRadians(index, count);
  const isSide = Math.abs(Math.sin(angle)) < 0.5;

  return {
    left: `${50 + 36 * 0.62 * Math.cos(angle)}%`,
    top: isSide ? '63%' : `${50 + 38 * 0.55 * Math.sin(angle)}%`,
  };
};

interface SeatProps {
  seat: ReplaySeat;
  style: React.CSSProperties;
}

const Seat = ({ seat, style }: SeatProps) => {
  const { i18n, t } = useLingui();

  return (
    <div
      className={cn(
        styles.seat,
        seat.folded && styles.folded,
        seat.isActing && styles.acting,
        seat.isWinner && styles.winner
      )}
      style={style}
    >
      <div className={styles.seatCards}>
        {seat.cards ? (
          seat.cards.map((card, index) => <MiniCard key={index} card={card} />)
        ) : (
          <>
            <MiniCard card={null} />
            <MiniCard card={null} />
          </>
        )}
      </div>
      <div className={styles.plate}>
        <span className={styles.name}>
          {seat.isWinner ? <Trophy size={11} /> : null}
          {seat.isMe ? t`You` : seat.name}
        </span>
        <span className={styles.stack}>{formatCompactNumber(seat.stack)}</span>
        {seat.lastAction ? (
          <span className={styles.badge}>
            {i18n._(ACTION_LABELS[seat.lastAction])}
          </span>
        ) : null}
      </div>
    </div>
  );
};

interface Props {
  hand: HandRecord;
}

export const HandReplayer = ({ hand }: Props) => {
  const { i18n, t } = useLingui();
  const timeline = React.useMemo(() => buildTimeline(hand), [hand]);
  const lastStep = timeline.length - 1;
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const state = replayState(hand, timeline, step);

  // Autoplay stops by itself on the last step.
  const isPlaying = playing && step < lastStep;

  React.useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setTimeout(() => setStep(step + 1), AUTOPLAY_MS);

    return () => window.clearTimeout(timer);
  }, [isPlaying, step]);

  const go = (next: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(lastStep, next)));
  };

  const togglePlay = () => {
    if (isPlaying) {
      setPlaying(false);
      return;
    }

    if (step >= lastStep) {
      setStep(0);
    }

    setPlaying(true);
  };

  const meIndex = Math.max(
    0,
    state.seats.findIndex(seat => seat.isMe)
  );
  const count = state.seats.length;
  const amount = (value: number | null) =>
    value ? ` ${formatCompactNumber(value)}` : '';

  let caption: React.ReactNode;
  const current = state.step;

  if (current.kind === 'start') {
    caption = t`Hand started`;
  } else if (current.kind === 'action') {
    const who = current.action.isMe ? t`You` : current.action.name;

    caption = (
      <>
        <b>{who}</b> · {i18n._(ACTION_LABELS[current.action.action])}
        {amount(current.action.amount)}
      </>
    );
  } else if (current.kind === 'deal') {
    caption = i18n._(STREET_LABELS[current.street] ?? msg`Preflop`);
  } else {
    caption = hand.winners.map(winner => (
      <span key={winner.seat} className={styles.captionWinner}>
        <b>{winner.isMe ? t`You` : winner.name}</b> +
        {formatCompactNumber(winner.amount)}
        {winner.combination ? ` · ${winner.combination}` : ''}
      </span>
    ));
  }

  return (
    <div className={styles.replayer}>
      <div className={styles.table}>
        <div className={styles.felt}>
          <div className={styles.center}>
            <span className={styles.street}>
              {i18n._(STREET_LABELS[state.street] ?? msg`Preflop`)}
            </span>
            <div className={styles.board}>
              {Array.from({ length: 5 }, (_, index) =>
                state.board[index] ? (
                  <MiniCard key={index} card={state.board[index]} />
                ) : (
                  <span key={index} className={styles.slot} />
                )
              )}
            </div>
            <span className={styles.pot}>
              {t`Pot`} {formatCompactNumber(state.pot)}
            </span>
          </div>
        </div>

        {state.seats.map((seat, index) => {
          const relative = (index - meIndex + count) % count;

          return (
            <React.Fragment key={seat.seat}>
              <Seat seat={seat} style={seatPosition(relative, count)} />
              {seat.bet > 0 ? (
                <span
                  className={styles.bet}
                  style={betPosition(relative, count)}
                >
                  {formatCompactNumber(seat.bet)}
                </span>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <p className={styles.caption} aria-live="polite">
        {caption}
      </p>

      <input
        type="range"
        className={styles.scrubber}
        min={0}
        max={lastStep}
        value={step}
        onChange={event => go(Number(event.target.value))}
        aria-label={t`Hand step`}
      />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => go(0)}
          disabled={step === 0}
          aria-label={t`To start`}
        >
          <ChevronsLeft size={20} />
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => go(step - 1)}
          disabled={step === 0}
          aria-label={t`Previous step`}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className={cn(styles.control, styles.play)}
          onClick={togglePlay}
          aria-label={isPlaying ? t`Pause` : t`Play`}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => go(step + 1)}
          disabled={step === lastStep}
          aria-label={t`Next step`}
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => go(lastStep)}
          disabled={step === lastStep}
          aria-label={t`To end`}
        >
          <ChevronsRight size={20} />
        </button>
      </div>

      <span className={styles.counter}>
        {step + 1} / {timeline.length}
      </span>
    </div>
  );
};
