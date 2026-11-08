import { useLingui } from '@lingui/react/macro';

import { useChipFormatter } from 'shared/lib/display-settings';
import { cn } from 'shared/utils/cn';

import { PlayerAction, SeatBadgeKind, type SeatActionBadge } from '../../model';

import styles from './action-badge.module.css';

const KIND_CLASS: Record<SeatActionBadge, string> = {
  [PlayerAction.FOLD]: styles.fold,
  [PlayerAction.CHECK]: styles.check,
  [PlayerAction.CALL]: styles.call,
  [PlayerAction.BET]: styles.bet,
  [PlayerAction.RAISE]: styles.raise,
  [SeatBadgeKind.ALL_IN]: styles.allIn,
  [SeatBadgeKind.SB]: styles.blind,
  [SeatBadgeKind.BB]: styles.blind,
  [SeatBadgeKind.WIN]: styles.win,
};

interface Props {
  action: SeatActionBadge;
  amount?: number;
}

export const ActionBadge = ({ action, amount }: Props) => {
  const formatChips = useChipFormatter();
  const { t } = useLingui();

  const labels: Record<SeatActionBadge, string> = {
    [PlayerAction.FOLD]: t`Fold`,
    [PlayerAction.CHECK]: t`Check`,
    [PlayerAction.CALL]: t`Call`,
    [PlayerAction.BET]: t`Bet`,
    [PlayerAction.RAISE]: t`Raise`,
    [SeatBadgeKind.ALL_IN]: t`All in`,
    [SeatBadgeKind.SB]: t`SB`,
    [SeatBadgeKind.BB]: t`BB`,
    [SeatBadgeKind.WIN]: t`Winner`,
  };

  const showAmount =
    amount != null && amount > 0 && action !== PlayerAction.FOLD;

  return (
    <div className={styles.root}>
      <span key={action} className={cn(styles.badge, KIND_CLASS[action])}>
        {labels[action]}
        {showAmount ? ` ${formatChips(amount)}` : null}
      </span>
    </div>
  );
};
