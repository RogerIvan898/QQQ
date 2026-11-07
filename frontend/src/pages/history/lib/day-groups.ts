import { useLingui } from '@lingui/react/macro';

const DAY_MS = 86_400_000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Groups items (already newest-first) by the calendar day of `getDate`. */
export const groupByDay = <T>(items: T[], getDate: (item: T) => string) => {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const day = startOfDay(new Date(getDate(item)));
    const group = groups.get(day);

    if (group) {
      group.push(item);
    } else {
      groups.set(day, [item]);
    }
  }

  return [...groups.entries()];
};

/** "Today" / "Yesterday" / "2 November" for a `groupByDay` key. */
export const useDayLabel = () => {
  const { i18n, t } = useLingui();
  const today = startOfDay(new Date());

  return (day: number) => {
    if (day === today) {
      return t`Today`;
    }

    if (day === today - DAY_MS) {
      return t`Yesterday`;
    }

    return new Intl.DateTimeFormat(i18n.locale, {
      day: 'numeric',
      month: 'long',
    }).format(day);
  };
};

export const useTimeFormat = () => {
  const { i18n } = useLingui();
  const formatter = new Intl.DateTimeFormat(i18n.locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (iso: string) => formatter.format(new Date(iso));
};
