import React from 'react';

import { useStoreMap, useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { Player, type SeatDirection } from 'entities/player';
import { BB_POST_MS, SB_POST_MS } from 'shared/config/table-timing';
import { useSettled } from 'shared/hooks/use-settled';

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
  const [round, myCards, handNumber, dealerSeat, turnTiming] = useUnit([
    gameModel.$round,
    gameModel.$myCards,
    gameModel.$handNumber,
    gameModel.$dealerSeat,
    gameModel.$turnTiming,
  ]);
  const seatCount = useStoreMap(
    gameModel.$players,
    players => Object.keys(players).length
  );
  const equitySlot = React.useMemo(() => <SeatEquity seat={seat} />, [seat]);

  const postAt = blindSeat ? SB_POST_MS : bigBlindSeat ? BB_POST_MS : null;
  const blindShown = useSettled(handNumber, postAt ?? 0);

  if (!player) return null;

  const hand = isViewer && myCards ? myCards : (revealed ?? player.hand);
  const blindHidden =
    postAt !== null &&
    !blindShown &&
    round === 'PREFLOP' &&
    player.committed > 0;
  const shownPlayer = blindHidden
    ? { ...player, committed: 0, stack: player.stack + player.committed }
    : player;
  const blindPosted =
    !blindHidden && round === 'PREFLOP' && player.committed > 0;
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
        player={shownPlayer}
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
        {...(turnTiming && {
          turnDurationSec: turnTiming.turnMs / 1000,
          timeBankSec: turnTiming.timeBankMs / 1000,
        })}
        dealOrder={dealOrderFrom(seat, dealerSeat, seatCount)}
        combinationSlot={<SeatCombination hand={hand} />}
      />
    </div>
  );
};

export const Seat = React.memo(SeatView);
