import React from 'react';
import { createPortal } from 'react-dom';

import { useStoreMap, useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { sessionModel } from 'entities/session';
import { $raisePanelRect } from 'features/player-actions';
import { useElementSize } from 'shared/hooks/use-element-size';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';

import styles from './players-layer.module.css';
import { Seat } from './seat';
import { computeSeats } from './seating';
import { useCollectFlights } from './use-collect-flights';
import { usePotFlights } from './use-pot-flights';

interface Props {
  tableElement: HTMLDivElement | null;
  onHidePot: (hidden: boolean) => void;
}

interface FlightProps {
  amount: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  arrived: boolean;
  className?: string;
}

const ChipFlight = ({
  amount,
  fromX,
  fromY,
  toX,
  toY,
  arrived,
  className,
}: FlightProps) => {
  const formatChips = useChipFormatter();

  return (
    <div
      className={cn(styles.flightX, className, arrived && styles.arrived)}
      style={
        {
          left: fromX,
          top: fromY,
          '--dx': `${toX - fromX}px`,
          '--dy': `${toY - fromY}px`,
        } as React.CSSProperties
      }
    >
      <div className={styles.flightY}>
        <div className={styles.potFlight}>
          <Logo size={16} className={styles.potFlightLogo} />
          <span>{formatChips(amount)}</span>
        </div>
      </div>
    </div>
  );
};

export const PlayersLayer = ({ tableElement, onHidePot }: Props) => {
  const [viewerId, collecting, raisePanel] = useUnit([
    sessionModel.$currentUserId,
    gameModel.$collectingBets,
    $raisePanelRect,
  ]);
  const seatingKey = useStoreMap(gameModel.$players, players =>
    Object.values(players)
      .map(player => `${player.seat}:${player.id}`)
      .join(',')
  );
  const seatPlayerIds = React.useMemo(
    () =>
      new Map(
        seatingKey
          .split(',')
          .filter(Boolean)
          .map(entry => {
            const [seat, ...id] = entry.split(':');

            return [Number(seat), id.join(':')] as const;
          })
      ),
    [seatingKey]
  );
  const viewerSeat = useStoreMap({
    store: gameModel.$players,
    keys: [viewerId],
    fn: (players, [id]) =>
      (id
        ? Object.values(players).find(player => player.id === id)?.seat
        : null) ?? null,
  });

  const tableSize = useElementSize(tableElement);
  const { collectFlights, collectAtPot } = useCollectFlights(
    collecting,
    tableElement
  );
  const viewerSeatRef = React.useRef<HTMLDivElement | null>(null);
  const [viewerLift, setViewerLift] = React.useState(0);

  const seats = React.useMemo(() => {
    if (!tableSize || !seatPlayerIds.size) return [];

    return computeSeats([...seatPlayerIds.keys()], viewerSeat, tableSize);
  }, [seatPlayerIds, viewerSeat, tableSize]);

  const { wins, flights, flightId, atWinner } = usePotFlights(
    tableElement,
    seats,
    onHidePot
  );

  React.useLayoutEffect(() => {
    const element = viewerSeatRef.current;
    const parent = element?.offsetParent;

    if (raisePanel === null || !element || !parent) {
      setViewerLift(0);
      return;
    }

    const seatBox = element.getBoundingClientRect();
    const overlapsHorizontally =
      seatBox.right > raisePanel.left && seatBox.left < raisePanel.right;

    if (!overlapsHorizontally) {
      setViewerLift(0);
      return;
    }

    const restingBottom =
      parent.getBoundingClientRect().top +
      element.offsetTop +
      element.offsetHeight / 2;

    setViewerLift(Math.max(0, Math.round(restingBottom - raisePanel.top + 8)));
  }, [raisePanel, seats]);

  if (!tableElement || !tableSize || !seats.length) {
    return null;
  }

  return createPortal(
    <div
      className={styles.playersLayer}
      style={{ '--table-w': `${tableSize.width}px` } as React.CSSProperties}
    >
      {collectFlights?.map(flight => (
        <ChipFlight
          key={`collect-${flight.seat}`}
          {...flight}
          arrived={collectAtPot}
          className={styles.collectFlight}
        />
      ))}
      {flights?.map(flight => (
        <ChipFlight
          key={`${flightId}-${flight.seat}`}
          {...flight}
          arrived={atWinner}
        />
      ))}
      {seats.map(({ seat, towardCenter, x, y }) => {
        const isViewer = seat === viewerSeat;

        return (
          <Seat
            key={`${seat}:${seatPlayerIds.get(seat)}`}
            ref={isViewer ? viewerSeatRef : undefined}
            seat={seat}
            x={x}
            y={y}
            towardCenter={towardCenter}
            isViewer={isViewer}
            lift={isViewer ? viewerLift : 0}
            collecting={collecting}
            winAmount={wins[seat]?.amount}
            winId={wins[seat]?.id}
          />
        );
      })}
    </div>,
    tableElement
  );
};
