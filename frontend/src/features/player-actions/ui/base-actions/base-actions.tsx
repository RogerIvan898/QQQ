import { useEffect, useRef, useState } from 'react';

import { useLingui } from '@lingui/react/macro';

import { useChipFormatter } from 'shared/lib/display-settings';
import { Button } from 'shared/ui/button';

import { call, check, fold } from '../../model';

import styles from './base-actions.module.css';

const CONFIRM_MS = 3000;

const CONFIRM_GUARD_MS = 500;

interface Props {
  canFold: boolean;
  canCall: boolean;
  canRaise: boolean;
  isBet: boolean;

  callAmount: number;
  onRaiseClick: () => void;
}

export const BaseActions = ({
  canFold,
  canCall,
  canRaise,
  isBet,
  callAmount,
  onRaiseClick,
}: Props) => {
  const { t } = useLingui();
  const formatChips = useChipFormatter();

  const foldLabel = t`Fold`;
  const callLabel =
    callAmount > 0 ? t`Call ${formatChips(callAmount)}` : t`Call`;
  const checkLabel = t`Check`;
  const betLabel = t`Bet`;
  const raiseLabel = t`Raise`;
  const canCheck = !canCall;
  const [confirmFold, setConfirmFold] = useState(false);
  const confirmedAt = useRef(0);

  useEffect(() => {
    if (!confirmFold) {
      return;
    }

    const timer = window.setTimeout(() => setConfirmFold(false), CONFIRM_MS);

    return () => window.clearTimeout(timer);
  }, [confirmFold]);

  const handleFold = () => {
    if (canCheck && !confirmFold) {
      confirmedAt.current = performance.now();
      setConfirmFold(true);
      return;
    }

    if (
      canCheck &&
      performance.now() - confirmedAt.current < CONFIRM_GUARD_MS
    ) {
      return;
    }

    setConfirmFold(false);
    fold();
  };

  return (
    <div className={styles.buttonRow}>
      {canFold && (
        <div className={styles.foldSlot}>
          {confirmFold ? (
            <div className={styles.hint} role="status">
              <span className={styles.hintText}>
                <b>{t`You can check for free`}</b>
                <span>{t`Tap Fold again to fold anyway`}</span>
              </span>
            </div>
          ) : null}
          <Button color="danger" text={foldLabel} onClick={handleFold} />
        </div>
      )}

      <Button
        color="neutral"
        text={canCall ? callLabel : checkLabel}
        onClick={canCall ? () => call() : () => check()}
      />

      {canRaise && (
        <Button
          color="primary"
          text={isBet ? betLabel : raiseLabel}
          onClick={onRaiseClick}
        />
      )}
    </div>
  );
};
