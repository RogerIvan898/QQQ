import React from 'react';

import { HAND_INTRO_MS, MUCK_MS } from 'shared/config/table-timing';
import { usePresence } from 'shared/hooks/use-presence';
import { cn } from 'shared/utils/cn';

import { useTurnTimer, useWinFlash } from '../hooks';
import {
  getDealerDirection,
  getHandKey,
  isBlindBadge,
  isStatusBadge,
  resolveSeatActionBadge,
  shouldShowHoleCards,
} from '../lib';
import {
  PlayerStatus,
  SeatBadgeKind,
  type BlindRole,
  type Player as PlayerType,
  type SeatDirection,
} from '../model';

import { ActionBadge } from './action-badge';
import { BetBadge } from './bet-badge';
import { DealerButton } from './dealer-button';
import { PlayerAvatar } from './player-avatar';
import { PlayerCards } from './player-cards';
import styles from './player.module.css';
import { StackBadge } from './stack-badge';

const DEFAULT_DIRECTION: SeatDirection = { x: 0, y: -1 };

interface Props {
  player: PlayerType;
  hand?: PlayerType['hand'];
  currentPlayer?: boolean;
  dealer: boolean;
  blindRole?: BlindRole | null;
  turnDurationSec?: number;
  timeBankSec?: number;
  onTurnTimeout?: () => void;
  turn: boolean;
  towardCenter?: SeatDirection;

  collecting?: boolean;
  reveal?: boolean;
  winAmount?: number;
  winId?: number;

  equitySlot?: React.ReactNode;

  combinationSlot?: React.ReactNode;

  handNumber?: number;

  dealOrder?: number;
}

const DEAL_STEP_MS = 70;

const PlayerView = ({
  player,
  hand: handOverride,
  currentPlayer = false,
  turnDurationSec = 15,
  timeBankSec = 10,
  onTurnTimeout,
  dealer = false,
  blindRole = null,
  turn = false,
  towardCenter = DEFAULT_DIRECTION,
  reveal = false,
  winAmount,
  winId,
  collecting = false,
  equitySlot = null,
  combinationSlot = null,
  handNumber = 0,
  dealOrder = 0,
}: Props) => {
  const { status, stack, name } = player;
  const hand = handOverride === undefined ? player.hand : handOverride;

  const isSitOut = status === PlayerStatus.SITTING_OUT;
  const isFolded = status === PlayerStatus.FOLDED;

  const seatActionBadge = resolveSeatActionBadge(
    player.lastAction,
    player.status,
    blindRole
  );

  const winning = useWinFlash(winId, winAmount);

  const [winHand, setWinHand] = React.useState<{
    winId: number;
    hand: number;
  } | null>(null);

  if (winId && winAmount && winHand?.winId !== winId) {
    setWinHand({ winId, hand: handNumber });
  }

  const wonThisHand = winHand !== null && winHand.hand === handNumber;

  const showWinner = winning && wonThisHand;

  const { showTimer, usingBank, phaseDurationMs } = useTurnTimer({
    isTurn: turn,
    turnDurationSec,
    timeBankSec,
    onTurnTimeout,
    playSound: currentPlayer,
  });

  const [readyHand, setReadyHand] = React.useState(handNumber);

  React.useEffect(() => {
    if (readyHand === handNumber) {
      return;
    }

    const timer = window.setTimeout(
      () => setReadyHand(handNumber),
      HAND_INTRO_MS
    );

    return () => window.clearTimeout(timer);
  }, [handNumber, readyHand]);

  const dealReady = readyHand === handNumber;

  const showCards =
    dealReady &&
    shouldShowHoleCards({
      hand,
      status,
      currentPlayer,
      reveal,
    });

  const dealerDirection = getDealerDirection(towardCenter);
  const directionVars = {
    '--to-center-x': towardCenter.x,
    '--to-center-y': towardCenter.y,
    '--to-center-abs-y': Math.abs(towardCenter.y),
    '--dealer-x': dealerDirection.x,
    '--dealer-y': dealerDirection.y,
  } as React.CSSProperties;

  const plateRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const plate = plateRef.current;

    if (!dealer || !plate) {
      return;
    }

    const ax = Math.abs(dealerDirection.x);
    const ay = Math.abs(dealerDirection.y);
    const measure = () => {
      const reach = (ax * plate.offsetWidth + ay * plate.offsetHeight) / 2;

      plate.style.setProperty('--plate-reach', `${Math.round(reach)}px`);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(plate);

    return () => observer.disconnect();
  }, [dealer, dealerDirection.x, dealerDirection.y]);

  const cardsKey = `${handNumber}:${getHandKey(hand) ?? 'hidden'}`;
  const cardsPresence = usePresence(showCards, MUCK_MS);

  return (
    <section className={cn(styles.player, isSitOut && styles.sitOut)}>
      <div
        ref={plateRef}
        className={styles.mainContainer}
        style={directionVars}
      >
        {dealer && (
          <div className={styles.dealerWrap}>
            <DealerButton compact />
          </div>
        )}

        <div className={styles.avatarWrap}>
          {cardsPresence.mounted && (
            <PlayerCards
              key={cardsKey}
              cards={hand}
              needSound={currentPlayer && Boolean(hand)}
              large={currentPlayer}
              dealDelayMs={dealOrder * DEAL_STEP_MS}
              mucking={cardsPresence.closing}
            />
          )}

          <PlayerAvatar
            name={name}
            folded={isFolded}
            currentPlayer={currentPlayer}
          />

          {!isFolded && equitySlot}
        </div>

        <div className={styles.stackArea}>
          {showWinner ? (
            <ActionBadge action={SeatBadgeKind.WIN} />
          ) : seatActionBadge &&
            (!collecting || isStatusBadge(seatActionBadge)) &&
            !wonThisHand ? (
            <ActionBadge
              action={seatActionBadge}
              amount={
                isBlindBadge(seatActionBadge)
                  ? undefined
                  : (player.lastActionAmount ?? undefined)
              }
            />
          ) : null}

          <StackBadge
            amount={stack}
            name={name}
            folded={isFolded}
            sitOut={isSitOut}
            turnActive={showTimer}
            turnDurationMs={phaseDurationMs}
            usingBank={usingBank}
            hasTimeBank={timeBankSec > 0}
            winAmount={winAmount}
            winId={winId}
            winning={showWinner}
            hero={currentPlayer}
          />

          {!isFolded && combinationSlot && (
            <div
              className={styles.combinationWrap}
              data-winning={showWinner || undefined}
            >
              {combinationSlot}
            </div>
          )}
        </div>

        {player.committed > 0 && (
          <BetBadge
            amount={player.committed}
            seat={player.seat}
            collecting={collecting}
          />
        )}
      </div>
    </section>
  );
};

export const Player = React.memo(PlayerView);
