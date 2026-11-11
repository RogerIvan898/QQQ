import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { gameModel } from 'entities/game';
import { useChipFormatter } from 'shared/lib/display-settings';
import { Button } from 'shared/ui/button';

import {
  $preAction,
  $viewer,
  canPreAct,
  chipsToCall,
  setPreAction,
  type PreAction,
} from '../../model';
import styles from '../base-actions/base-actions.module.css';

export const PreActions = () => {
  const { t } = useLingui();
  const [activeAction, setActive, viewer, currentBet] = useUnit([
    $preAction,
    setPreAction,
    $viewer,
    gameModel.$currentBet,
  ]);

  const formatChips = useChipFormatter();
  const toCall =
    viewer && canPreAct(viewer.status)
      ? chipsToCall(currentBet, viewer.committed, viewer.stack)
      : 0;

  const callAmount = formatChips(toCall);

  const toggle = (action: PreAction) => {
    setActive(activeAction === action ? null : action);
  };

  const checkLabel = t`Check`;
  const checkFoldLabel = t`Check / Fold`;
  const callAmountLabel = t`Call ${callAmount}`;
  const callLabel = t`Call`;

  return (
    <div className={styles.buttonRow}>
      <Button
        color="neutral"
        text={checkLabel}
        isActive={activeAction === 'check'}
        disabled={toCall > 0}
        onClick={() => toggle('check')}
      />

      <Button
        color="neutral"
        text={checkFoldLabel}
        isActive={activeAction === 'check_fold'}
        onClick={() => toggle('check_fold')}
      />

      <Button
        color="neutral"
        text={toCall > 0 ? callAmountLabel : callLabel}
        singleLine
        isActive={activeAction === 'call'}
        disabled={toCall === 0}
        onClick={() => toggle('call')}
      />
    </div>
  );
};
