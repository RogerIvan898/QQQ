import { cn } from 'shared/utils/cn';

import styles from './dealer-button.module.css';

interface Props {
  className?: string;
  compact?: boolean;
}

export const DealerButton = ({ className, compact = false }: Props) => (
  <div
    className={cn(styles.dealerButton, compact && styles.compact, className)}
  >
    <span className={styles.letter}>D</span>
  </div>
);
