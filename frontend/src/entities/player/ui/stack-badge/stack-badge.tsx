import React from 'react';

import { POT_FLIGHT_MS, WINNER_REVEAL_MS } from 'shared/config/table-timing';
import { useAnimatedNumber } from 'shared/hooks/use-animated-number';
import { usePresence } from 'shared/hooks/use-presence';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';

import styles from './stack-badge.module.css';

const WIN_MS = WINNER_REVEAL_MS + POT_FLIGHT_MS;

const URGENT_MS = 5000;

const TURN_FADE_MS = 300;
const TURN_LEAVE_MS = 250;

const TurnBorder = ({
  durationMs,
  bank,
  final,
  leaving,
}: {
  durationMs: number;
  bank: boolean;

  final: boolean;

  leaving: boolean;
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

        !bank && styles.turnBorderEnter,
        bank && styles.turnBorderBank,
        urgent && styles.turnBorderUrgent,
        leaving && styles.turnBorderLeave
      )}
      style={{
        animationDuration: bank
          ? `${durationMs}ms`
          : `${durationMs}ms, ${TURN_FADE_MS}ms`,
      }}
      aria-hidden
    />
  );
};

interface Props {
  amount: number;
  name: string;
  folded?: boolean;
  sitOut?: boolean;
  turnActive?: boolean;
  turnDurationMs?: number;
  usingBank?: boolean;
  hasTimeBank?: boolean;
  winAmount?: number;
  winId?: number;
  winning?: boolean;
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
  winning = false,
  hero = false,
}: Props) => {
  const formatChips = useChipFormatter(false);
  const turnPresence = usePresence(turnActive, TURN_LEAVE_MS);
  const [settledWinId, setSettledWinId] = React.useState<number | null>(null);
  const isHoldingWin = Boolean(winId && winAmount && winId !== settledWinId);
  const displayAmount =
    isHoldingWin && winAmount ? Math.max(0, amount - winAmount) : amount;
  const counted = useAnimatedNumber(displayAmount);
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
          winning && styles.frameWin,
          folded && styles.frameFolded,
          sitOut && styles.frameSitOut
        )}
      >
        {turnPresence.mounted && (
          <TurnBorder
            key={usingBank ? 'bank' : 'turn'}
            durationMs={turnDurationMs}
            bank={usingBank}
            final={usingBank || !hasTimeBank}
            leaving={turnPresence.closing}
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
