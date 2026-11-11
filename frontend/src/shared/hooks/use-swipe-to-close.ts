import React from 'react';

const CLOSE_SHARE = 0.4;

const FLICK_SPEED = 0.8;

const FLICK_MIN_PX = 40;

const DRAG_START_PX = 4;

export const useSwipeToClose = (onClose: () => void, enabled = true) => {
  const [offset, setOffset] = React.useState(0);
  const start = React.useRef<number | null>(null);
  const sheetHeight = React.useRef(0);
  const lastMove = React.useRef({ y: 0, time: 0, speed: 0 });

  const onPointerDown = (event: React.PointerEvent) => {
    if (!enabled) {
      return;
    }

    start.current = event.clientY;

    sheetHeight.current =
      event.currentTarget.parentElement?.getBoundingClientRect().height ?? 0;
    lastMove.current = { y: event.clientY, time: event.timeStamp, speed: 0 };
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

    const elapsed = event.timeStamp - lastMove.current.time;

    if (elapsed > 0) {
      lastMove.current = {
        y: event.clientY,
        time: event.timeStamp,
        speed: (event.clientY - lastMove.current.y) / elapsed,
      };
    }

    setOffset(Math.max(0, delta));
  };

  const onPointerEnd = () => {
    if (start.current === null) {
      return;
    }

    start.current = null;

    const farEnough = offset > sheetHeight.current * CLOSE_SHARE;
    const flicked =
      lastMove.current.speed > FLICK_SPEED && offset > FLICK_MIN_PX;

    if (farEnough || flicked) {
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
