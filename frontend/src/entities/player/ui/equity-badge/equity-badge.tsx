import { useAnimatedNumber } from 'shared/hooks/use-animated-number';

import styles from './equity-badge.module.css';

interface Props {
  /** 0..1 share of the pot. */
  equity: number;
}

/** All-in equity above the hole cards: "72.5%". Not a result, just odds. */
export const EquityBadge = ({ equity }: Props) => {
  const percent = useAnimatedNumber(equity * 100);

  return (
    <span className={styles.badge} aria-label={`${(equity * 100).toFixed(1)}%`}>
      {percent.toFixed(1)}%
    </span>
  );
};
