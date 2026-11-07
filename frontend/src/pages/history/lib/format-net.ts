import { formatCompactNumber } from 'shared/utils/format';

/** Signed chip amount: "+120" / "−40" / "0". */
export const formatNet = (net: number) =>
  net === 0
    ? '0'
    : `${net > 0 ? '+' : '−'}${formatCompactNumber(Math.abs(net))}`;
