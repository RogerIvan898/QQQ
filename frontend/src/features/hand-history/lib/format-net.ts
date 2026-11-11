import { formatCompactNumber } from 'shared/utils/format';

export const formatNet = (net: number) =>
  net === 0
    ? '0'
    : `${net > 0 ? '+' : '−'}${formatCompactNumber(Math.abs(net))}`;
