import React from 'react';

import { cn } from 'shared/utils/cn';

import { useTurnTimer } from '../hooks';
import {
  getDealerDirection,
  getHandKey,
  isBlindBadge,
  resolveSeatActionBadge,
  shouldShowHoleCards,
} from '../lib';
import {
  PlayerStatus,
  type BlindRole,
  type Player as PlayerType,
  type SeatDirection,
} from '../model';

import { ActionBadge } from './action-badge';
import { BetBadge } from './bet-badge';
import { DealerButton } from './dealer-button';
import { EquityBadge } from './equity-badge';
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
  /** Bets are flying into the pot: hide seat badges and animate bet chips. */
  collecting?: boolean;
  reveal?: boolean;
  winAmount?: number;
  winId?: number;
  /** All-in runout equity (0..1); undefined/null when not shown. */
  equity?: number | null;
  /** Exact values get one decimal; sampled estimates are whole percent. */
  equityExact?: boolean;
}

const PlayerView = ({
  player,
  hand = player.hand,
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
  equity = null,
  equityExact = true,
}: Props) => {
  const { status, stack, name } = player;

  const isSitOut = status === PlayerStatus.SITTING_OUT;
  const isFolded = status === PlayerStatus.FOLDED;

  const seatActionBadge = resolveSeatActionBadge(
    player.lastAction,
    player.status,
    blindRole
  );

  const { showTimer, usingBank, phaseDurationMs } = useTurnTimer({
    isTurn: turn,
    turnDurationSec,
    timeBankSec,
    onTurnTimeout,
    playSound: currentPlayer,
  });

  const showCards = shouldShowHoleCards({
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

  const cardsKey = getHandKey(hand) ?? 'hidden';

  return (
    <section className={cn(styles.player, isSitOut && styles.sitOut)}>
      <div className={styles.mainContainer} style={directionVars}>
        <div className={styles.avatarWrap}>
          {showCards && (
            <PlayerCards
              key={cardsKey}
              cards={hand}
              needSound={currentPlayer && Boolean(hand)}
              large={currentPlayer}
            />
          )}

          <PlayerAvatar
            name={name}
            folded={isFolded}
            currentPlayer={currentPlayer}
          />

          {equity !== null && !isFolded && (
            <EquityBadge equity={equity} decimals={equityExact ? 1 : 0} />
          )}

          {dealer && (
            <div className={styles.dealerWrap}>
              <DealerButton compact />
            </div>
          )}
        </div>

        <div className={styles.stackArea}>
          {seatActionBadge && !collecting && (
            <ActionBadge
              action={seatActionBadge}
              amount={
                isBlindBadge(seatActionBadge)
                  ? undefined
                  : (player.lastActionAmount ?? undefined)
              }
            />
          )}

          <StackBadge
            amount={stack}
            name={name}
            folded={isFolded}
            sitOut={isSitOut}
            turnActive={showTimer}
            turnDurationMs={phaseDurationMs}
            usingBank={usingBank}
            winAmount={winAmount}
            winId={winId}
          />
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
