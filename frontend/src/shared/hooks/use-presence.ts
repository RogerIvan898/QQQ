import React from 'react';

export const EXIT_MS = 160;

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
