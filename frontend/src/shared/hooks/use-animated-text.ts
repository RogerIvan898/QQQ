import React from 'react';

const DURATION_MS = 450;

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useAnimatedText = <T extends HTMLElement>(
  target: number,
  format: (value: number) => string
) => {
  const ref = React.useRef<T | null>(null);
  const valueRef = React.useRef(target);
  const formatRef = React.useRef(format);

  const write = (value: number) => {
    valueRef.current = value;

    if (ref.current) {
      ref.current.textContent = formatRef.current(value);
    }
  };

  React.useLayoutEffect(() => {
    formatRef.current = format;

    if (ref.current) {
      ref.current.textContent = format(valueRef.current);
    }
  });

  React.useEffect(() => {
    const from = valueRef.current;

    if (from === target) {
      return;
    }

    if (prefersReducedMotion()) {
      write(target);
      return;
    }

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);

      write(from + (target - from) * (1 - (1 - progress) ** 3));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target]);

  return ref;
};
