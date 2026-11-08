import { createEvent, createStore } from 'effector';
import { useUnit } from 'effector-react';

import { formatCompactNumber } from 'shared/utils/format';

const STORAGE_KEY = 'poker:amounts-in-bb';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

export const setAmountsInBb = createEvent<boolean>();

export const $amountsInBb = createStore(readStored()).on(
  setAmountsInBb,
  (_, enabled) => enabled
);

$amountsInBb.updates.watch(enabled => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    void 0;
  }
});

export const displayBigBlindChanged = createEvent<number>();

export const $displayBigBlind = createStore(0).on(
  displayBigBlindChanged,
  (_, bigBlind) => bigBlind
);

export const formatBigBlinds = (amount: number, bigBlind: number) => {
  const value = Math.round((amount / bigBlind) * 10) / 10;

  return `${Number.isInteger(value) ? value : value.toFixed(1)} BB`;
};

export const useChipFormatter = () => {
  const [inBb, bigBlind] = useUnit([$amountsInBb, $displayBigBlind]);

  return (amount: number) =>
    inBb && bigBlind > 0
      ? formatBigBlinds(amount, bigBlind)
      : formatCompactNumber(amount);
};
