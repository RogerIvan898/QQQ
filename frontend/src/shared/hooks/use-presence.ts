import React from 'react';

/** Matches `--dur-exit` in theme.css. */
export const EXIT_MS = 160;

/**
 * Keeps an element mounted while its exit animation plays. `mounted` says
 * whether to render it; `closing` is true during the exit, for an exit class.
 */
export const usePresence = (open: boolean, exitMs = EXIT_MS) => {
  const [mounted, setMounted] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  if (open && (!mounted || closing)) {
    setMounted(true);
    setClosing(false);
  }

  if (!open && mounted && !closing) {
    setClosing(true);
  }

  React.useEffect(() => {
    if (!closing) {
      return;
    }

    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);

    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  return { mounted, closing };
};
