import { useLingui } from '@lingui/react/macro';

import { Button } from 'shared/ui/button';

import { call, check, fold } from '../../model';

import styles from './base-actions.module.css';

interface Props {
  canFold: boolean;
  canCall: boolean;
  canRaise: boolean;
  isBet: boolean;
  onRaiseClick: () => void;
}

export const BaseActions = ({
  canFold,
  canCall,
  canRaise,
  isBet,
  onRaiseClick,
}: Props) => {
  const { t } = useLingui();

  const foldLabel = t`Fold`;
  const callLabel = t`Call`;
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
