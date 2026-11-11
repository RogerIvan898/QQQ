import React from 'react';

import { COMPACT_TABLE_WIDTH, type TableShape } from './seating';

const RATIO_STEP = 0.02;

const readShape = (element: HTMLElement): TableShape | null => {
  const { width, height } = element.getBoundingClientRect();

  if (!width || !height) {
    return null;
  }

  return {
    compact: width < COMPACT_TABLE_WIDTH,
    ratio: Math.round(height / width / RATIO_STEP) * RATIO_STEP,
  };
};

export const useTableShape = (element: HTMLElement | null) => {
  const [shape, setShape] = React.useState<TableShape | null>(null);

  React.useLayoutEffect(() => {
    if (!element) {
      setShape(null);
      return;
    }

    const update = () => {
      const next = readShape(element);

      setShape(prev =>
        prev &&
        next &&
        prev.compact === next.compact &&
        prev.ratio === next.ratio
          ? prev
          : next
      );
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return shape;
};
