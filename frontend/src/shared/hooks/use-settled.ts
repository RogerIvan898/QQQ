import React from 'react';

export const useSettled = <T>(key: T, delayMs: number) => {
  const [settledKey, setSettledKey] = React.useState(key);

  React.useEffect(() => {
    if (Object.is(settledKey, key)) {
      return;
    }

    const timer = window.setTimeout(() => setSettledKey(key), delayMs);

    return () => window.clearTimeout(timer);
  }, [key, settledKey, delayMs]);

  return Object.is(settledKey, key);
};
