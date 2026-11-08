import { useStoreMap } from 'effector-react';

import { EquityBadge } from 'entities/player';
import { equityModel } from 'features/equity';

interface Props {
  seat: number;
}

export const SeatEquity = ({ seat }: Props) => {
  const equity = useStoreMap({
    store: equityModel.$equity,
    keys: [seat],
    fn: (state, [index]) => state?.bySeat[index] ?? null,
  });
  const exact = useStoreMap(equityModel.$equity, state => state?.exact ?? true);

  if (equity === null) {
    return null;
  }

  return <EquityBadge equity={equity} decimals={exact ? 1 : 0} />;
};
