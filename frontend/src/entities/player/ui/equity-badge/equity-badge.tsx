import { useAnimatedText } from 'shared/hooks/use-animated-text';

import styles from './equity-badge.module.css';

interface Props {
  equity: number;

  decimals?: 0 | 1;
}

export const EquityBadge = ({ equity, decimals = 1 }: Props) => {
  const percentRef = useAnimatedText<HTMLSpanElement>(
    equity * 100,
    value => `${value.toFixed(decimals)}%`
  );

  return (
    <span
      ref={percentRef}
      className={styles.badge}
      aria-label={`${(equity * 100).toFixed(decimals)}%`}
    />
  );
};
