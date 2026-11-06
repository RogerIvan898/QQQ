/** Returns `null` for a draft that is not a number yet, e.g. `"1.2.3"`. */
export const parseAmountDraft = (value: string) => {
  if (value === '' || value === '.') {
    return 0;
  }

  const parsed = Number(value);

  return Number.isNaN(parsed) ? null : parsed;
};

export const formatAmountDraft = (value: number) =>
  value === 0 ? '' : String(value);
