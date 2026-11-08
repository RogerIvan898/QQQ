import { useLingui } from '@lingui/react/macro';

import { useChipFormatter } from 'shared/lib/display-settings';
import { Button } from 'shared/ui/button';

import { call, check, fold } from '../../model';

import styles from './base-actions.module.css';

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

  return (
    <div className={styles.buttonRow}>
      {canFold && (
        <Button color="danger" text={foldLabel} onClick={() => fold()} />
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
