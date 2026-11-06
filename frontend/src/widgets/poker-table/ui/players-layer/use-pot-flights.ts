import React from 'react';

import { SERVER_EVENTS, gameModel } from 'entities/game';

import { getPotCenter } from './get-pot-center';
import type { SeatLayout } from './seating';
import type { PotFlight } from './types';

const POT_MOVE_MS = 750;

export const usePotFlights = (
  tableElement: HTMLDivElement | null,
  seats: SeatLayout[],
  onHidePot: (hidden: boolean) => void
) => {
  const seatsRef = React.useRef(seats);

  React.useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  const [wins, setWins] = React.useState<
    Record<number, { amount: number; id: number }>
  >({});
  const [flights, setFlights] = React.useState<PotFlight[] | null>(null);
  const [flightId, setFlightId] = React.useState(0);
  const [atWinner, setAtWinner] = React.useState(false);

  React.useEffect(
    () =>
      gameModel.incomingEvent.watch(event => {
        if (event.type === SERVER_EVENTS.HAND_STARTED) {
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
          const seat = seatsRef.current.find(
            item => item.seat === winner.seatIndex
          );

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
        setFlights(next);
        setAtWinner(false);
        setFlightId(id => id + 1);
        onHidePot(true);
      }),
    [onHidePot, tableElement]
  );

  React.useEffect(() => {
    if (!flights) {
      return;
    }

    const frame = requestAnimationFrame(() => setAtWinner(true));
    const done = window.setTimeout(() => setFlights(null), POT_MOVE_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [flightId, flights]);

  return { wins, flights, flightId, atWinner };
};
