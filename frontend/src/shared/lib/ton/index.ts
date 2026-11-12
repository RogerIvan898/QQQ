const TON_DECIMALS = 9;

/**
 * TON → nanoton without @ton/core (≈200 kB): toFixed(9) never yields an
 * exponent, so the decimal string splits cleanly into whole and fraction.
 */
export const toNanoSafe = (amount: number): bigint => {
  const [whole, fraction = ''] = Math.abs(amount)
    .toFixed(TON_DECIMALS)
    .split('.');
  const nano =
    BigInt(whole) * 10n ** BigInt(TON_DECIMALS) +
    BigInt(fraction.padEnd(TON_DECIMALS, '0'));

  return amount < 0 ? -nano : nano;
};

export const formatTonAmount = (value: number): string =>
  String(Number(value.toFixed(TON_DECIMALS)));
