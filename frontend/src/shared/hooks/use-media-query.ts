import React from 'react';

/** Live `matchMedia` result, e.g. `useMediaQuery('(max-width: 767px)')`. */
export const useMediaQuery = (query: string) => {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);

      list.addEventListener('change', onChange);

      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
};
