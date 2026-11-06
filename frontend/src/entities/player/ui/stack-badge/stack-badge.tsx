import React from 'react';

import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import styles from './stack-badge.module.css';

const WIN_MS = 750;

interface Props {
  amount: number;
  name: string;
  folded?: boolean;
  sitOut?: boolean;
  turnActive?: boolean;
  turnDurationMs?: number;
  usingBank?: boolean;
  winAmount?: number;
  winId?: number;
}

export const StackBadge = ({
  amount,
  name,
  folded = false,
  sitOut = false,
  turnActive = false,
  turnDurationMs = 0,
  usingBank = false,
  winAmount,
  winId,
}: Props) => {
  const [settledWinId, setSettledWinId] = React.useState<number | null>(null);
  const isHoldingWin = Boolean(winId && winAmount && winId !== settledWinId);
  const displayAmount =
    isHoldingWin && winAmount ? Math.max(0, amount - winAmount) : amount;

  React.useEffect(() => {
    if (!isHoldingWin || !winId) {
      return;
    }

    const timer = window.setTimeout(() => setSettledWinId(winId), WIN_MS);

    return () => window.clearTimeout(timer);
  }, [isHoldingWin, winId]);

  return (
    <div className={styles.wrap}>
      <div
        className={cn(
          styles.frame,
          folded && styles.frameFolded,
          sitOut && styles.frameSitOut
        )}
      >
        {turnActive && (
          <div
            key={usingBank ? 'bank' : 'turn'}
            className={cn(styles.timerFill, usingBank && styles.timerFillBank)}
            style={{ animationDuration: `${turnDurationMs}ms` }}
            aria-hidden
          />
        )}

        <div className={styles.content}>
          <span className={styles.name}>{name}</span>
          <div className={styles.stackRow}>
            <span className={styles.stackAmount}>
              {formatCompactNumber(displayAmount)}
            </span>
            <Logo size={16} className={styles.stackLogo} />
          </div>
        </div>
      </div>
    </div>
  );
};
