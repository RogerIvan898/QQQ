import React from 'react';

import { createWatch } from 'effector';
import { useProvidedScope } from 'effector-react';

import { SERVER_EVENTS, gameModel, type ServerGameEvent } from 'entities/game';
import { POT_FLIGHT_MS, winRevealMs } from 'shared/config/table-timing';

import { getPotCenter } from './get-pot-center';
import type { SeatLayout } from './seating';
import type { PotFlight } from './types';

export const usePotFlights = (
  tableElement: HTMLDivElement | null,
  seats: SeatLayout[],
  onHidePot: (hidden: boolean) => void
) => {
  const [wins, setWins] = React.useState<
    Record<number, { amount: number; id: number }>
  >({});
  const [flights, setFlights] = React.useState<PotFlight[] | null>(null);
  const [flightId, setFlightId] = React.useState(0);
  const scope = useProvidedScope();
  const revealTimer = React.useRef<number | null>(null);

  const clearReveal = () => {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
  };

  const onTableEvent = React.useEffectEvent(
    ({ event, showdown }: { event: ServerGameEvent; showdown: boolean }) => {
      if (event.type === SERVER_EVENTS.HAND_STARTED) {
        clearReveal();
        setFlights(null);
        onHidePot(false);
        return;
      }

      if (event.type !== SERVER_EVENTS.HAND_COMPLETED || !tableElement) {
        return;
      }

      const tableRect = tableElement.getBoundingClientRect();
      const { x: fromX, y: fromY } = getPotCenter(tableElement, tableRect);

      const next = event.payload.winners.flatMap(winner => {
        const seat = seats.find(item => item.seat === winner.seatIndex);

        if (!seat) {
          return [];
        }

        return [
          {
            seat: winner.seatIndex,
            amount: winner.amountWon,
            fromX,
            fromY,
            toX: seat.fx * tableRect.width,
            toY: seat.fy * tableRect.height,
          },
        ];
      });

      if (!next.length) {
        return;
      }

      setWins(current => {
        const updated = { ...current };

        event.payload.winners.forEach(winner => {
          updated[winner.seatIndex] = {
            amount: winner.amountWon,
            id: (current[winner.seatIndex]?.id ?? 0) + 1,
          };
        });

        return updated;
      });

      clearReveal();
      revealTimer.current = window.setTimeout(() => {
        revealTimer.current = null;
        setFlights(next);
        setFlightId(id => id + 1);
        onHidePot(true);
      }, winRevealMs(showdown));
    }
  );

  React.useEffect(() => clearReveal, []);

  React.useEffect(
    () =>
      createWatch({
        unit: gameModel.tableAnimationEvent,
        scope: scope ?? undefined,
        fn: onTableEvent,
      }),
    [scope]
  );

  React.useEffect(() => {
    if (!flights) {
      return;
    }

    const done = window.setTimeout(() => setFlights(null), POT_FLIGHT_MS);

    return () => window.clearTimeout(done);
  }, [flightId, flights]);

  return { wins, flights, flightId };
};
