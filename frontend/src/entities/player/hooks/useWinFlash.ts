import React from 'react';

import { HAND_END_MS } from 'shared/config/table-timing';

const WIN_FLASH_MS = HAND_END_MS;

export const useWinFlash = (winId?: number, winAmount?: number) => {
  const [doneId, setDoneId] = React.useState<number | null>(null);
  const winning = Boolean(winId && winAmount && winId !== doneId);

  React.useEffect(() => {
    if (!winning || !winId) {
      return;
    }

    const timer = window.setTimeout(() => setDoneId(winId), WIN_FLASH_MS);

    return () => window.clearTimeout(timer);
  }, [winning, winId]);

  return winning;
};
