import React from 'react';

import { useStoreMap, useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { Player, type SeatDirection } from 'entities/player';

import styles from './players-layer.module.css';
import { SeatCombination } from './seat-combination';
import { SeatEquity } from './seat-equity';

interface Props {
  seat: number;
  x: number;
  y: number;
  towardCenter: SeatDirection;
  isViewer: boolean;
  lift: number;
  collecting: boolean;
  winAmount?: number;
  winId?: number;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * One seat subscribes only to its own slice of the game state, so an event
 * that touches one player re-renders one seat instead of the whole layer.
 */
/** Seat's place in the deal, starting left of the dealer (0, 1, 2…). */
const dealOrderFrom = (
  seat: number,
  dealerSeat: number | null,
  seatCount: number
) => {
  const span = Math.max(seatCount, seat + 1, (dealerSeat ?? 0) + 1);

  return dealerSeat == null ? seat : (seat - dealerSeat - 1 + span) % span;
};

const SeatView = ({
  seat,
  x,
  y,
  towardCenter,
  isViewer,
  lift,
  collecting,
  winAmount,
  winId,
  ref,
}: Props) => {
  const player = useStoreMap({
    store: gameModel.$players,
    keys: [seat],
    fn: (players, [index]) => players[index] ?? null,
  });
  const dealer = useStoreMap({
    store: gameModel.$dealerSeat,
    keys: [seat],
    fn: (dealerSeat, [index]) => dealerSeat === index,
  });
  const turn = useStoreMap({
    store: gameModel.$activeSeat,
    keys: [seat],
    fn: (activeSeat, [index]) => activeSeat === index,
  });
  const blindSeat = useStoreMap({
    store: gameModel.$smallBlindSeat,
    keys: [seat],
    fn: (smallBlindSeat, [index]) => smallBlindSeat === index,
  });
  const bigBlindSeat = useStoreMap({
    store: gameModel.$bigBlindSeat,
    keys: [seat],
    fn: (bigBlind, [index]) => bigBlind === index,
  });
  const revealed = useStoreMap({
    store: gameModel.$debugHoles,
    keys: [seat],
    fn: (holes, [index]) => holes[index] ?? null,
  });
  const [round, myCards, handNumber, dealerSeat] = useUnit([
    gameModel.$round,
    gameModel.$myCards,
    gameModel.$handNumber,
    gameModel.$dealerSeat,
  ]);
  const seatCount = useStoreMap(
    gameModel.$players,
    players => Object.keys(players).length
  );
  const equitySlot = React.useMemo(() => <SeatEquity seat={seat} />, [seat]);

  if (!player) return null;

  const hand = isViewer && myCards ? myCards : (revealed ?? player.hand);
  const blindPosted = round === 'PREFLOP' && player.committed > 0;
  const blindRole = !blindPosted
    ? null
    : blindSeat
      ? 'sb'
      : bigBlindSeat
        ? 'bb'
        : null;

  return (
    <div
      ref={ref}
      className={styles.seatWrapper}
      style={{
        left: x,
        top: y,
        ...(lift ? { translate: `0 -${lift}px` } : undefined),
      }}
    >
      <Player
        player={player}
        hand={hand}
        dealer={dealer}
        blindRole={blindRole}
        currentPlayer={isViewer}
        turn={turn}
        towardCenter={towardCenter}
        reveal={!isViewer && Boolean(revealed)}
        winAmount={winAmount}
        winId={winId}
        collecting={collecting}
        equitySlot={equitySlot}
        handNumber={handNumber}
        dealOrder={dealOrderFrom(seat, dealerSeat, seatCount)}
        combinationSlot={<SeatCombination hand={hand} />}
      />
    </div>
  );
};

export const Seat = React.memo(SeatView);
