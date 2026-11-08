import React from 'react';

import type { SeatDirection } from '../model';

export const useDealerReach = (
  plateRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  direction: SeatDirection
) => {
  const ax = Math.abs(direction.x);
  const ay = Math.abs(direction.y);

  React.useLayoutEffect(() => {
    const plate = plateRef.current;

    if (!enabled || !plate) {
      return;
    }

    const measure = () => {
      const reach = (ax * plate.offsetWidth + ay * plate.offsetHeight) / 2;

      plate.style.setProperty('--plate-reach', `${Math.round(reach)}px`);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(plate);

    return () => observer.disconnect();
  }, [plateRef, enabled, ax, ay]);
};
