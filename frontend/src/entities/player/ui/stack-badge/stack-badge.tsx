import React from 'react';

import { useAnimatedNumber } from 'shared/hooks/use-animated-number';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';

import styles from './stack-badge.module.css';

const WIN_MS = 750;
/** The outline turns red for the last seconds of the turn. */
const URGENT_MS = 5000;

/** The badge outline as a draining timer; re-keyed when turn → time bank. */
const TurnBorder = ({
  durationMs,
  bank,
  final,
}: {
  durationMs: number;
  bank: boolean;
  /** Last phase (no time bank after it): only then the end goes red. */
  final: boolean;
}) => {
  const [urgent, setUrgent] = React.useState(final && durationMs <= URGENT_MS);

  React.useEffect(() => {
    if (!final || durationMs <= URGENT_MS) {
      return;
    }

    const timer = window.setTimeout(
      () => setUrgent(true),
      durationMs - URGENT_MS
    );

    return () => window.clearTimeout(timer);
  }, [durationMs, final]);

  return (
    <div
      className={cn(
        styles.turnBorder,
        bank && styles.turnBorderBank,
        urgent && styles.turnBorderUrgent
      )}
      style={{ animationDuration: `${durationMs}ms` }}
      aria-hidden
    />
  );
};
/** Winner glow: covers the pot landing and the stack counting up. */
const WIN_GLOW_MS = 1900;

interface Props {
  amount: number;
  name: string;
  folded?: boolean;
  sitOut?: boolean;
  turnActive?: boolean;
  turnDurationMs?: number;
  usingBank?: boolean;
  /** Whether a time bank follows the main time. */
  hasTimeBank?: boolean;
  winAmount?: number;
  winId?: number;
  /** The viewer's own seat: highlighted so it stands out at a full table. */
  hero?: boolean;
}

export const StackBadge = ({
  amount,
  name,
  folded = false,
  sitOut = false,
  turnActive = false,
  turnDurationMs = 0,
  usingBank = false,
  hasTimeBank = true,
  winAmount,
  winId,
  hero = false,
}: Props) => {
  const formatChips = useChipFormatter();
  const [settledWinId, setSettledWinId] = React.useState<number | null>(null);
  const isHoldingWin = Boolean(winId && winAmount && winId !== settledWinId);
  const [glowDoneId, setGlowDoneId] = React.useState<number | null>(null);
  const isWinning = Boolean(winId && winAmount && winId !== glowDoneId);

  React.useEffect(() => {
    if (!isWinning || !winId) {
      return;
    }

    const timer = window.setTimeout(() => setGlowDoneId(winId), WIN_GLOW_MS);

    return () => window.clearTimeout(timer);
  }, [isWinning, winId]);
  const displayAmount =
    isHoldingWin && winAmount ? Math.max(0, amount - winAmount) : amount;
  const counted = useAnimatedNumber(displayAmount);
  // Winnings count up once the pot lands; bets drop the stack at once (min).
  const shownAmount = Math.min(displayAmount, Math.round(counted * 100) / 100);

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
          hero && styles.frameHero,
          turnActive && styles.frameTurn,
          isWinning && styles.frameWin,
          folded && styles.frameFolded,
          sitOut && styles.frameSitOut
        )}
      >
        {turnActive && (
          <TurnBorder
            key={usingBank ? 'bank' : 'turn'}
            durationMs={turnDurationMs}
            bank={usingBank}
            final={usingBank || !hasTimeBank}
          />
        )}

        <div className={styles.content}>
          <span className={styles.name}>{name}</span>
          <div className={styles.stackRow}>
            <span className={styles.stackAmount}>
              {formatChips(shownAmount)}
            </span>
            <Logo size={16} className={styles.stackLogo} />
          </div>
        </div>
      </div>
    </div>
  );
};
