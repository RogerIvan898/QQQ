import React from 'react';
import { createPortal } from 'react-dom';

import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { fork } from 'effector';
import { Provider, useUnit } from 'effector-react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
} from 'lucide-react';

import { gameModel, type GameStreet } from 'entities/game';
import { sessionModel } from 'entities/session';
import {
  buildTimeline,
  replayState,
  type ReplayStep,
  toGameState,
  type HandRecord,
} from 'features/hand-history';
import {
  $amountsInBb,
  $displayBigBlind,
  formatBigBlinds,
} from 'shared/lib/display-settings';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';
import { PokerBoard } from 'widgets/poker-table';

import styles from './hand-replay.module.css';

const AUTOPLAY_MS = 1100;

type ActionKind = HandRecord['actions'][number]['action'];

const ACTION_LABELS = {
  SB: msg`Small blind`,
  BB: msg`Big blind`,
  FOLD: msg`Fold`,
  CHECK: msg`Check`,
  CALL: msg`Call`,
  BET: msg`Bet`,
  RAISE: msg`Raise`,
} as const satisfies Record<ActionKind, MessageDescriptor>;

/** Must match `--thumb` in hand-replay.module.css. */
const SCRUBBER_THUMB_PX = 16;
/** Half the tooltip's max width, so it never overflows the panel. */
const TOOLTIP_EDGE_PX = 90;

const STREET_LABELS: Partial<Record<GameStreet, MessageDescriptor>> = {
  PREFLOP: msg`Preflop`,
  FLOP: msg`Flop`,
  TURN: msg`Turn`,
  RIVER: msg`River`,
  SHOWDOWN: msg`Showdown`,
};

interface Props {
  hand: HandRecord;
  onClose: () => void;
}

/**
 * Step-by-step replay drawn with the real table widget: each step is fed into
 * an isolated effector scope, so the live game state is never touched.
 */
export const HandReplay = ({ hand, onClose }: Props) => {
  const { i18n, t } = useLingui();
  const [viewerId, amountsInBb] = useUnit([
    sessionModel.$currentUserId,
    $amountsInBb,
  ]);
  // The caption sits outside the replay scope: format with this hand's blind.
  const formatChips = (amount: number) =>
    amountsInBb && hand.bigBlind > 0
      ? formatBigBlinds(amount, hand.bigBlind)
      : formatCompactNumber(amount);
  const timeline = React.useMemo(() => buildTimeline(hand), [hand]);
  const lastStep = timeline.length - 1;
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const replay = replayState(hand, timeline, step);

  const scope = React.useMemo(() => {
    const state = replayState(hand, timeline, step);
    const me = state.seats.find(seat => seat.isMe);

    return fork({
      values: [
        [gameModel.$gameState, toGameState(hand, state, viewerId)],
        [
          gameModel.$myCards,
          me?.cards && me.cards.length === 2
            ? [me.cards[0], me.cards[1]]
            : null,
        ],
        [gameModel.$debugHoles, {}],
        [gameModel.$collectingBets, false],
        [sessionModel.$currentUserId, viewerId],
        // The scope starts from defaults; carry the setting and table blind in.
        [$amountsInBb, amountsInBb],
        [$displayBigBlind, hand.bigBlind],
      ],
    });
  }, [hand, timeline, step, viewerId, amountsInBb]);

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

  /** Text for one replay step: the caption, and the scrubber's hover tooltip. */
  const describe = (item: ReplayStep): React.ReactNode => {
    if (item.kind === 'start') {
      return t`Hand started`;
    }

    if (item.kind === 'action') {
      return (
        <>
          <b>{item.action.isMe ? t`You` : item.action.name}</b> ·{' '}
          {i18n._(ACTION_LABELS[item.action.action])}
          {item.action.amount ? ` ${formatChips(item.action.amount)}` : ''}
        </>
      );
    }

    if (item.kind === 'deal') {
      return i18n._(STREET_LABELS[item.street] ?? msg`Preflop`);
    }

    return hand.winners.map(winner => (
      <span key={winner.seat} className={styles.captionLine}>
        <b>{winner.isMe ? t`You` : winner.name}</b> +
        {formatChips(winner.amount)}
        {winner.combination ? ` · ${winner.combination}` : ''}
      </span>
    ));
  };

  const caption = describe(replay.step);

  // Hover tooltip (mouse only; touch already shows the caption as you drag).
  const [hover, setHover] = React.useState<{
    index: number;
    x: number;
  } | null>(null);

  const handleTrackHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const usable = rect.width - SCRUBBER_THUMB_PX;
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left - SCRUBBER_THUMB_PX / 2) / usable)
    );
    const index = Math.round(ratio * lastStep);
    const tickX =
      SCRUBBER_THUMB_PX / 2 + (lastStep > 0 ? index / lastStep : 0) * usable;

    setHover({
      index,
      // Keep the tooltip inside the panel near the ends.
      x: Math.min(
        rect.width - TOOLTIP_EDGE_PX,
        Math.max(TOOLTIP_EDGE_PX, tickX)
      ),
    });
  };

  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(hand.startedAt));

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <ArrowLeft size={14} strokeWidth={2.25} />
          {t`Hands`}
        </button>
        <span className={styles.title}>{t`Hand at ${time}`}</span>
      </header>

      <Provider value={scope}>
        <PokerBoard />
      </Provider>

      <div className={styles.panel}>
        <p className={styles.caption} aria-live="polite">
          {caption}
        </p>

        <div
          className={styles.scrubberTrack}
          onPointerMove={handleTrackHover}
          onPointerLeave={() => setHover(null)}
          style={
            {
              '--progress': lastStep > 0 ? step / lastStep : 0,
            } as React.CSSProperties
          }
        >
          <input
            type="range"
            className={styles.scrubber}
            min={0}
            max={lastStep}
            value={step}
            onChange={event => go(Number(event.target.value))}
            aria-label={t`Hand step`}
          />
          {hover ? (
            <div
              className={styles.tooltip}
              style={{ left: hover.x }}
              aria-hidden="true"
            >
              <span className={styles.tooltipStep}>
                {hover.index + 1}/{timeline.length}
              </span>
              {describe(timeline[hover.index])}
            </div>
          ) : null}
          {/* One tick per step; new streets and the showdown get a tall one. */}
          <div className={styles.ticks} aria-hidden="true">
            {timeline.map((item, index) => (
              <span
                key={index}
                className={cn(
                  styles.tick,
                  (item.kind === 'deal' || item.kind === 'showdown') &&
                    styles.tickStreet,
                  index <= step && styles.tickPassed
                )}
                style={{
                  left: `${lastStep > 0 ? (index / lastStep) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
        </div>

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
          <span className={styles.counter}>
            {step + 1}/{timeline.length}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
