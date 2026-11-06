import type { StreetConcludedEvent } from './types';

export const getTotalPot = ({
  main,
  sidePots,
}: StreetConcludedEvent['payload']) =>
  main + sidePots.reduce((sum, pot) => sum + pot.amount, 0);
