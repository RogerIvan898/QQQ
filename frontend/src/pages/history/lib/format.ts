import { formatBalance } from 'shared/utils/format';

export const formatSignedTon = (value: number, locale: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatBalance(Math.abs(value), locale)} TON`;

export const formatTon = (value: number, locale: string) =>
  `${formatBalance(value, locale)} TON`;

export const formatSessionTime = (
  startedAt: string,
  endedAt: string,
  locale: string
) => {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${date} · ${time.format(start)} – ${time.format(end)}`;
};
