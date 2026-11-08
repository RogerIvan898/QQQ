import React from 'react';

import { HAND_END_MS } from 'shared/config/table-timing';

/** Until the stack has counted up, i.e. as long as the hand-end pause. */
const WIN_FLASH_MS = HAND_END_MS;

/**
 * True while a seat is being shown as the winner: from the moment the hand
 * ends (before the pot flies) until its stack has counted up. Each new
 * `winId` starts it again.
 */
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
