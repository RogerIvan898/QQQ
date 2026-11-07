import { useLingui } from '@lingui/react/macro';

import { useChipFormatter } from 'shared/lib/display-settings';
import { Badge, type BadgeVariant } from 'shared/ui/badge';
import { cn } from 'shared/utils/cn';

import { PlayerAction, SeatBadgeKind, type SeatActionBadge } from '../../model';

import styles from './action-badge.module.css';

const BADGE_VARIANTS: Record<SeatActionBadge, BadgeVariant> = {
  [PlayerAction.FOLD]: 'neutral',
  [PlayerAction.CHECK]: 'warning',
  [PlayerAction.CALL]: 'primary',
  [PlayerAction.BET]: 'primary',
  [PlayerAction.RAISE]: 'active',
  [SeatBadgeKind.ALL_IN]: 'primary',
  [SeatBadgeKind.SB]: 'primary',
  [SeatBadgeKind.BB]: 'primary',
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
  };

  const showAmount =
    amount != null && amount > 0 && action !== PlayerAction.FOLD;

  return (
    <div className={styles.root}>
      <Badge
        variant={BADGE_VARIANTS[action]}
        className={cn(
          styles.compact,
          action === SeatBadgeKind.ALL_IN && styles.allInBorder
        )}
      >
        {labels[action]}
        {showAmount ? ` ${formatChips(amount)}` : null}
      </Badge>
    </div>
  );
};
