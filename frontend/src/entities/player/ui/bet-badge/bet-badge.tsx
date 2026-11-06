import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';
import { formatCompactNumber } from 'shared/utils/format';

import styles from './bet-badge.module.css';

interface Props {
  amount: number;
  seat: number;
  collecting: boolean;
}

export const BetBadge = ({ amount, seat, collecting }: Props) => {
  if (amount <= 0) return null;

  return (
    <div
      className={cn(styles.betArea, collecting && styles.collect)}
      data-bet={amount}
      data-bet-seat={seat}
    >
      <div className={styles.amountBadge}>
        <Logo size={18} className={styles.amountLogo} />
        <span key={amount} className={styles.amountValue}>
          {formatCompactNumber(amount)}
        </span>
      </div>
    </div>
  );
};
