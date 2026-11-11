import React from 'react';

export const useElapsed = (startedAt: number, delayMs: number) => {
  const remaining = () => startedAt + delayMs - performance.now();
  const [doneFor, setDoneFor] = React.useState(() =>
    remaining() <= 0 ? startedAt : null
  );

  React.useEffect(() => {
    if (doneFor === startedAt) {
      return;
    }

    const timer = window.setTimeout(
      () => setDoneFor(startedAt),
      Math.max(0, startedAt + delayMs - performance.now())
    );

    return () => window.clearTimeout(timer);
  }, [startedAt, delayMs, doneFor]);

  return doneFor === startedAt;
};
