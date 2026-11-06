import React from 'react';
import { createPortal } from 'react-dom';

import { useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { findPlayerById, Player } from 'entities/player';
import { sessionModel } from 'entities/session';
import { $raisePanelTop } from 'features/player-actions';
import { useElementSize } from 'shared/hooks/use-element-size';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import styles from './players-layer.module.css';
import { computeSeats } from './seating';
import { useCollectFlights } from './use-collect-flights';
import { usePotFlights } from './use-pot-flights';

interface Props {
  tableElement: HTMLDivElement | null;
  onHidePot: (hidden: boolean) => void;
}

export const PlayersLayer = ({ tableElement, onHidePot }: Props) => {
  const [
    players,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    round,
    activeSeat,
    viewerId,
    myCards,
    debugHoles,
    collecting,
  ] = useUnit([
    gameModel.$players,
    gameModel.$dealerSeat,
    gameModel.$smallBlindSeat,
    gameModel.$bigBlindSeat,
    gameModel.$round,
    gameModel.$activeSeat,
    sessionModel.$currentUserId,
    gameModel.$myCards,
    gameModel.$debugHoles,
    gameModel.$collectingBets,
  ]);

  const tableSize = useElementSize(tableElement);
  const { collectFlights, collectAtPot } = useCollectFlights(
    collecting,
    tableElement
  );
  const playerList = Object.values(players);
  const viewerSeat = findPlayerById(players, viewerId)?.seat ?? null;
  const raisePanelTop = useUnit($raisePanelTop);
  const viewerSeatRef = React.useRef<HTMLDivElement | null>(null);
  const [viewerLift, setViewerLift] = React.useState(0);
  const seatNumbersKey = playerList.map(player => player.seat).join(',');

  const seats = React.useMemo(() => {
    if (!tableSize || !seatNumbersKey) return [];

    return computeSeats(
      seatNumbersKey.split(',').map(Number),
      viewerSeat,
      tableSize
    );
  }, [seatNumbersKey, viewerSeat, tableSize]);

  const { wins, flights, flightId, atWinner } = usePotFlights(
    tableElement,
    seats,
    onHidePot
  );

  // Lift the viewer's seat just enough to clear the raise panel. Uses the
  // layout box (offsetTop/offsetHeight), which the lift's `translate` and its
  // transition don't affect, so repeated measurements stay stable.
  React.useLayoutEffect(() => {
    const element = viewerSeatRef.current;
    const parent = element?.offsetParent;

    if (raisePanelTop === null || !element || !parent) {
      setViewerLift(0);
      return;
    }

    // The wrapper is centered on its anchor with translate(-50%, -50%).
    const restingBottom =
      parent.getBoundingClientRect().top +
      element.offsetTop +
      element.offsetHeight / 2;

    setViewerLift(Math.max(0, Math.round(restingBottom - raisePanelTop + 8)));
  }, [raisePanelTop, seats]);

  if (!tableElement || !tableSize || !seats.length) {
    return null;
  }

  return createPortal(
    <div className={styles.playersLayer}>
      {collectFlights?.map(flight => (
        <div
          key={`collect-${flight.seat}`}
          className={cn(
            styles.potFlight,
            styles.collectFlight,
            collectAtPot && styles.arrived
          )}
          style={{
            left: collectAtPot ? flight.toX : flight.fromX,
            top: collectAtPot ? flight.toY : flight.fromY,
          }}
        >
          <Logo size={16} className={styles.potFlightLogo} />
          <span>{formatCompactNumber(flight.amount)}</span>
        </div>
      ))}
      {flights?.map(flight => (
        <div
          key={`${flightId}-${flight.seat}`}
          className={cn(styles.potFlight, atWinner && styles.arrived)}
          style={{
            left: atWinner ? flight.toX : flight.fromX,
            top: atWinner ? flight.toY : flight.fromY,
          }}
        >
          <Logo size={16} className={styles.potFlightLogo} />
          <span>{formatCompactNumber(flight.amount)}</span>
        </div>
      ))}
      {seats.map(({ seat, towardCenter, x, y }) => {
        const player = players[seat];

        if (!player) return null;

        const isViewer = player.id === viewerId;
        const revealed = debugHoles[player.seat];
        const hand = isViewer && myCards ? myCards : (revealed ?? player.hand);
        const blindPosted = round === 'PREFLOP' && player.committed > 0;
        const blindRole = !blindPosted
          ? null
          : player.seat === smallBlindSeat
            ? 'sb'
            : player.seat === bigBlindSeat
              ? 'bb'
              : null;

        return (
          <div
            key={player.id}
            ref={isViewer ? viewerSeatRef : undefined}
            className={styles.seatWrapper}
            style={{
              left: x,
              top: y,
              ...(isViewer && viewerLift
                ? { translate: `0 -${viewerLift}px` }
                : undefined),
            }}
          >
            <Player
              player={player}
              hand={hand}
              dealer={player.seat === dealerSeat}
              blindRole={blindRole}
              currentPlayer={isViewer}
              turn={player.seat === activeSeat}
              towardCenter={towardCenter}
              reveal={!isViewer && Boolean(revealed)}
              winAmount={wins[player.seat]?.amount}
              winId={wins[player.seat]?.id}
              collecting={collecting}
            />
          </div>
        );
      })}
    </div>,
    tableElement
  );
};
