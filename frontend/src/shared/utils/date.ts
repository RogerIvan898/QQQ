export const DAY_MS = 86_400_000;

/** Local midnight of the given date, as a timestamp. */
export const startOfDay = (date: Date | string | number) => {
  const value = new Date(date);

  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime();
};
