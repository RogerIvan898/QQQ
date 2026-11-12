import React from 'react';
import { createPortal } from 'react-dom';

import { useStoreMap, useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { sessionModel } from 'entities/session';
import { $raisePanelRect } from 'features/player-actions';
import { useChipFormatter } from 'shared/lib/display-settings';
import { GramMark } from 'shared/ui/gram';
import { cn } from 'shared/utils/cn';

import styles from './players-layer.module.css';
import { Seat } from './seat';
import { computeSeats } from './seating';
import { useCollectFlights } from './use-collect-flights';
import { usePotFlights } from './use-pot-flights';
import { useTableShape } from './use-table-shape';

interface Props {
  tableElement: HTMLDivElement | null;
  onHidePot: (hidden: boolean) => void;
}

type FlightKind = 'pot' | 'collect';

interface FlightProps {
  amount: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  kind: FlightKind;
}

interface Phase {
  duration: number;
  easing: string;
  delay?: number;
}

const FLIGHT_TIMING: Record<FlightKind, { x: Phase; y: Phase; fade: Phase }> = {
  pot: {
    x: { duration: 700, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    y: { duration: 700, easing: 'cubic-bezier(0.6, -0.25, 0.4, 1)' },
    fade: { duration: 320, delay: 380, easing: 'ease-in' },
  },
  collect: {
    x: { duration: 420, easing: 'cubic-bezier(0.55, 0, 0.2, 1)' },
    y: { duration: 420, easing: 'cubic-bezier(0.55, 0, 0.2, 1)' },
    fade: { duration: 200, delay: 220, easing: 'ease-in' },
  },
};

/**
 * Web Animations API, started on mount: the first frame is already the start
 * keyframe, so there's no "render, wait two frames, flip a class" dance and
 * no React re-render to launch the flight. The outer box animates X and the
 * inner one Y with different easings, which together trace an arc on the
 * compositor.
 */
const ChipFlight = ({ amount, fromX, fromY, toX, toY, kind }: FlightProps) => {
  const formatChips = useChipFormatter(false);
  const xRef = React.useRef<HTMLDivElement | null>(null);
  const yRef = React.useRef<HTMLDivElement | null>(null);
  const dx = toX - fromX;
  const dy = toY - fromY;

  React.useLayoutEffect(() => {
    const x = xRef.current;
    const y = yRef.current;

    if (!x || !y) {
      return;
    }

    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const timing = FLIGHT_TIMING[kind];
    const options = ({ duration, easing, delay = 0 }: Phase) => ({
      duration: reduced ? 1 : duration,
      delay: reduced ? 0 : delay,
      easing,
      fill: 'forwards' as const,
    });

    const animations = [
      x.animate(
        [{ transform: 'none' }, { transform: `translateX(${dx}px)` }],
        options(timing.x)
      ),
      x.animate([{ opacity: 1 }, { opacity: 0 }], options(timing.fade)),
      y.animate(
        [{ transform: 'none' }, { transform: `translateY(${dy}px)` }],
        options(timing.y)
      ),
    ];

    return () => animations.forEach(animation => animation.cancel());
  }, [dx, dy, kind]);

  return (
    <div
      ref={xRef}
      className={cn(styles.flightX, kind === 'collect' && styles.collectFlight)}
      style={{ left: fromX, top: fromY }}
    >
      <div ref={yRef}>
        <div className={styles.potFlight}>
          <GramMark size={16} className={styles.potFlightLogo} />
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

  const tableShape = useTableShape(tableElement);
  const collectFlights = useCollectFlights(collecting, tableElement);
  const viewerSeatRef = React.useRef<HTMLDivElement | null>(null);
  const [viewerLift, setViewerLift] = React.useState(0);

  const seats = React.useMemo(() => {
    if (!tableShape || !seatPlayerIds.size) return [];

    return computeSeats([...seatPlayerIds.keys()], viewerSeat, tableShape);
  }, [seatPlayerIds, viewerSeat, tableShape]);

  const { wins, flights, flightId } = usePotFlights(
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

  if (!tableElement || !tableShape || !seats.length) {
    return null;
  }

  return createPortal(
    <div className={styles.playersLayer}>
      {collectFlights?.map(flight => (
        <ChipFlight key={`collect-${flight.seat}`} {...flight} kind="collect" />
      ))}
      {flights?.map(flight => (
        <ChipFlight key={`${flightId}-${flight.seat}`} {...flight} kind="pot" />
      ))}
      {seats.map(({ seat, towardCenter, fx, fy }) => {
        const isViewer = seat === viewerSeat;

        return (
          <Seat
            key={`${seat}:${seatPlayerIds.get(seat)}`}
            ref={isViewer ? viewerSeatRef : undefined}
            seat={seat}
            x={`${(fx * 100).toFixed(3)}%`}
            y={`${(fy * 100).toFixed(3)}%`}
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
