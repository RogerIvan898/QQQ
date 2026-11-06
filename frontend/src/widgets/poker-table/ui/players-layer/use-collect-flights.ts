import React from 'react';

import { getPotCenter } from './get-pot-center';
import type { CollectFlight } from './types';

export const useCollectFlights = (
  collecting: boolean,
  tableElement: HTMLDivElement | null
) => {
  const [collectFlights, setCollectFlights] = React.useState<
    CollectFlight[] | null
  >(null);
  const [collectAtPot, setCollectAtPot] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!collecting || !tableElement) {
      setCollectFlights(null);
      setCollectAtPot(false);
      return;
    }

    const tableRect = tableElement.getBoundingClientRect();
    const bets = [...tableElement.querySelectorAll<HTMLElement>('[data-bet]')];

    if (bets.length === 0) {
      return;
    }

    const { x: toX, y: toY } = getPotCenter(tableElement, tableRect);

    setCollectAtPot(false);
    setCollectFlights(
      bets.map(bet => {
        const betRect = bet.getBoundingClientRect();

        return {
          seat: bet.dataset.betSeat ?? '',
          amount: Number(bet.dataset.bet),
          fromX: betRect.left - tableRect.left + betRect.width / 2,
          fromY: betRect.top - tableRect.top + betRect.height / 2,
          toX,
          toY,
        };
      })
    );

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setCollectAtPot(true));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [collecting, tableElement]);

  return { collectFlights, collectAtPot };
};
