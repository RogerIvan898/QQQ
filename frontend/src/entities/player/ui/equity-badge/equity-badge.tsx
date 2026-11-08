import { useAnimatedNumber } from 'shared/hooks/use-animated-number';

import styles from './equity-badge.module.css';

interface Props {
  equity: number;

  decimals?: 0 | 1;
}

export const EquityBadge = ({ equity, decimals = 1 }: Props) => {
  const percent = useAnimatedNumber(equity * 100);

  return (
    <span
      className={styles.badge}
      aria-label={`${(equity * 100).toFixed(decimals)}%`}
    >
      {percent.toFixed(decimals)}%
    </span>
  );
};
