export const parseAmountDraft = (value: string) => {
  if (value === '' || value === '.') {
    return 0;
  }

  const parsed = Number(value);

  return Number.isNaN(parsed) ? null : parsed;
};

export const formatAmountDraft = (value: number) =>
  value === 0 ? '' : String(value);
