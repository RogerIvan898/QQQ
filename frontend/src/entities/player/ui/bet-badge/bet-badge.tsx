import { useChipFormatter } from 'shared/lib/display-settings';
import { Logo } from 'shared/ui/logo';
import { cn } from 'shared/utils/cn';

import styles from './bet-badge.module.css';

interface Props {
  amount: number;
  seat: number;
  collecting: boolean;
}

export const BetBadge = ({ amount, seat, collecting }: Props) => {
  const formatChips = useChipFormatter();
  if (amount <= 0) return null;

  return (
    <div
      className={cn(styles.betArea, collecting && styles.collect)}
      data-bet={amount}
      data-bet-seat={seat}
    >
      <div className={styles.amountBadge}>
        <span className={styles.amountLogoGlow}>
          <Logo size={18} className={styles.amountLogo} />
        </span>
        <span key={amount} className={styles.amountValue}>
          {formatChips(amount)}
        </span>
      </div>
    </div>
  );
};
