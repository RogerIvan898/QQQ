import React from 'react';

import { usePresence } from 'shared/hooks/use-presence';
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
  /**
   * All-in equity badge. A slot, not a value: it subscribes to equity itself,
   * so a % update re-renders only the badge, not the whole seat.
   */
  equitySlot?: React.ReactNode;
  /** Made-hand label under the stack ("Two pair"); hidden when folded. */
  combinationSlot?: React.ReactNode;
  /** Changes every hand, so hole cards are dealt again. */
  handNumber?: number;
  /** Place in the deal from the dealer's left: staggers the cards around the table. */
  dealOrder?: number;
}

/** Gap between seats as the hole cards go round the table. */
const DEAL_STEP_MS = 70;
/** Matches the muck transition in player-cards.module.css. */
const MUCK_MS = 320;

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

  const cardsKey = `${handNumber}:${getHandKey(hand) ?? 'hidden'}`;
  // Keep the cards a moment after a fold so they can slide into the muck.
  const cardsPresence = usePresence(showCards, MUCK_MS);

  return (
    <section className={cn(styles.player, isSitOut && styles.sitOut)}>
      <div className={styles.mainContainer} style={directionVars}>
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
            hero={currentPlayer}
          />

          {!isFolded && combinationSlot && (
            <div className={styles.combinationWrap}>{combinationSlot}</div>
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
