import React from 'react';

import { SERVER_EVENTS, gameModel, type ServerGameEvent } from 'entities/game';
import { POT_FLIGHT_MS, WINNER_REVEAL_MS } from 'shared/config/table-timing';
import { afterNextPaint } from 'shared/utils/after-next-paint';

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
  const [atWinner, setAtWinner] = React.useState(false);
  const revealTimer = React.useRef<number | null>(null);

  const clearReveal = () => {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
  };

  const onTableEvent = React.useEffectEvent((event: ServerGameEvent) => {
    if (event.type === SERVER_EVENTS.HAND_STARTED) {
      clearReveal();
      setFlights(null);
      setAtWinner(false);
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
          toX: seat.x,
          toY: seat.y,
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
      setAtWinner(false);
      setFlightId(id => id + 1);
      onHidePot(true);
    }, WINNER_REVEAL_MS);
  });

  React.useEffect(() => clearReveal, []);

  React.useEffect(() => gameModel.incomingEvent.watch(onTableEvent), []);

  React.useEffect(() => {
    if (!flights) {
      return;
    }

    const cancelStart = afterNextPaint(() => setAtWinner(true));
    const done = window.setTimeout(() => setFlights(null), POT_FLIGHT_MS);

    return () => {
      cancelStart();
      window.clearTimeout(done);
    };
  }, [flightId, flights]);

  return { wins, flights, flightId, atWinner };
};
