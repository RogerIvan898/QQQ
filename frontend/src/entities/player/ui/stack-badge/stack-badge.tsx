import React from 'react';

import { POT_FLIGHT_MS, WINNER_REVEAL_MS } from 'shared/config/table-timing';
import { useAnimatedNumber } from 'shared/hooks/use-animated-number';
import { usePresence } from 'shared/hooks/use-presence';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';

import styles from './stack-badge.module.css';

/** The stack holds its old value until the pot has landed. */
const WIN_MS = WINNER_REVEAL_MS + POT_FLIGHT_MS;
/** The outline turns red for the last seconds of the turn. */
const URGENT_MS = 5000;

/** The badge outline as a draining timer; re-keyed when turn → time bank. */
/** Ring fade-in at the start of a turn, and fade-out after it. */
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
  /** Last phase (no time bank after it): only then the end goes red. */
  final: boolean;
  /** The turn just ended: fade out where it stopped. */
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
        // The bank picks up where the turn left off: no second fade-in.
        !bank && styles.turnBorderEnter,
        bank && styles.turnBorderBank,
        urgent && styles.turnBorderUrgent,
        leaving && styles.turnBorderLeave
      )}
      style={{
        // drain, (fade-in)
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
  /** Whether a time bank follows the main time. */
  hasTimeBank?: boolean;
  winAmount?: number;
  winId?: number;
  /** Shown as the hand's winner right now (see useWinFlash). */
  winning?: boolean;
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
  winning = false,
  hero = false,
}: Props) => {
  const formatChips = useChipFormatter();
  // Keeps the timer ring for its fade-out once the turn is over.
  const turnPresence = usePresence(turnActive, TURN_LEAVE_MS);
  const [settledWinId, setSettledWinId] = React.useState<number | null>(null);
  const isHoldingWin = Boolean(winId && winAmount && winId !== settledWinId);
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
