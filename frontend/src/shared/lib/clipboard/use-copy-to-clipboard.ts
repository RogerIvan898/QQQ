import React from 'react';

export const useCopyToClipboard = (resetAfterMs: number) => {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const copy = React.useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);

      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => setCopied(false),
        resetAfterMs
      );
    },
    [resetAfterMs]
  );

  return { copied, copy };
};
