import React from 'react';

import { handEndMs } from 'shared/config/table-timing';

export const useWinFlash = (
  winId?: number,
  winAmount?: number,
  showdown = true
) => {
  const [doneId, setDoneId] = React.useState<number | null>(null);
  const winning = Boolean(winId && winAmount && winId !== doneId);

  React.useEffect(() => {
    if (!winning || !winId) {
      return;
    }

    const timer = window.setTimeout(
      () => setDoneId(winId),
      handEndMs(showdown)
    );

    return () => window.clearTimeout(timer);
  }, [winning, winId, showdown]);

  return winning;
};
