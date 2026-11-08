import React from 'react';

/** Dragging down this far (px) dismisses on release. */
const SWIPE_CLOSE_PX = 90;
/** Movement before the drag takes the pointer, so plain taps still click. */
const DRAG_START_PX = 4;

/**
 * Swipe-down-to-close for bottom sheets. Spread `handlers` on the grab
 * handle / header and apply `offset` as translateY while `dragging`.
 */
export const useSwipeToClose = (onClose: () => void, enabled = true) => {
  const [offset, setOffset] = React.useState(0);
  const start = React.useRef<number | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (enabled) {
      start.current = event.clientY;
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (start.current === null) {
      return;
    }

    const delta = event.clientY - start.current;

    if (
      delta > DRAG_START_PX &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setOffset(Math.max(0, delta));
  };

  const onPointerEnd = () => {
    if (start.current === null) {
      return;
    }

    start.current = null;

    if (offset > SWIPE_CLOSE_PX) {
      onClose();
    } else {
      setOffset(0);
    }
  };

  return {
    offset,
    dragging: offset > 0,
    reset: () => setOffset(0),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
};
