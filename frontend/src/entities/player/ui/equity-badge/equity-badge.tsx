import { useAnimatedNumber } from 'shared/hooks/use-animated-number';

import styles from './equity-badge.module.css';

interface Props {
  /** 0..1 share of the pot. */
  equity: number;
  /** 1 for exact values ("72.5%"), 0 for sampled estimates ("72%"). */
  decimals?: 0 | 1;
}

/** All-in equity above the hole cards: "72.5%". Not a result, just odds. */
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
