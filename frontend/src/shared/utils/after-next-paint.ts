/**
 * Runs `callback` after the browser has painted the current state: two
 * animation frames, since one can land before the start position is
 * committed and the CSS transition then never starts. Returns a canceller.
 */
export const afterNextPaint = (callback: () => void) => {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback);
  });

  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
};
