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
