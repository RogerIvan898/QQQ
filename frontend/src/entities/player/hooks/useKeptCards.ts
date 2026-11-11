import React from 'react';

import type { Player } from '../model';

export const useKeptCards = (
  showCards: boolean,
  key: string,
  hand: Player['hand']
) => {
  const [kept, setKept] = React.useState({ key, hand });

  if (showCards && (kept.key !== key || kept.hand !== hand)) {
    setKept({ key, hand });
  }

  return showCards ? { key, hand } : kept;
};
