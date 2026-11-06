import React from 'react';

import { bufferCache, loadBuffer, startBuffer } from './audio';

interface PlayOptions {
  onStart?: () => void;
}

export const useSound = (url: string) => {
  const [ready, setReady] = React.useState(() => bufferCache.has(url));
  const pendingPlaysRef = React.useRef<PlayOptions[]>([]);

  const play = React.useCallback(
    (options?: PlayOptions) => {
      const run = (buffer: AudioBuffer, onStart?: () => void) => {
        startBuffer(buffer);
        onStart?.();
      };

      const cached = bufferCache.get(url);

      if (cached) {
        run(cached, options?.onStart);

        return;
      }

      pendingPlaysRef.current.push(options ?? {});

      loadBuffer(url)
        .then(buffer => {
          const queued = pendingPlaysRef.current.splice(0);

          queued.forEach(({ onStart }) => run(buffer, onStart));
        })
        .catch((error: unknown) => {
          pendingPlaysRef.current = [];
          console.warn(`[Audio] ${url}`, error);
        });
    },
    [url]
  );

  React.useEffect(() => {
    let isMounted = true;

    loadBuffer(url)
      .then(() => {
        if (isMounted) {
          setReady(true);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      pendingPlaysRef.current = [];
    };
  }, [url]);

  return { play, ready };
};
