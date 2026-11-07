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

/** Show table amounts in big blinds instead of chips. Per device, off by default. */
export const $amountsInBb = createStore(readStored()).on(
  setAmountsInBb,
  (_, enabled) => enabled
);

$amountsInBb.updates.watch(enabled => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode); the setting just won't persist.
  }
});

export const displayBigBlindChanged = createEvent<number>();

/** Big blind of the table on screen, fed by the game model. */
export const $displayBigBlind = createStore(0).on(
  displayBigBlindChanged,
  (_, bigBlind) => bigBlind
);

/** "12.5 BB" / "2 BB": one decimal, no trailing ".0". */
export const formatBigBlinds = (amount: number, bigBlind: number) => {
  const value = Math.round((amount / bigBlind) * 10) / 10;

  return `${Number.isInteger(value) ? value : value.toFixed(1)} BB`;
};

/**
 * Formats a chip amount for the table: big blinds when the setting is on and
 * the big blind is known, compact chips otherwise.
 */
export const useChipFormatter = () => {
  const [inBb, bigBlind] = useUnit([$amountsInBb, $displayBigBlind]);

  return (amount: number) =>
    inBb && bigBlind > 0
      ? formatBigBlinds(amount, bigBlind)
      : formatCompactNumber(amount);
};
