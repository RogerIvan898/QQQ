import type { GameSession, SessionPeriod } from './types';

const DAY_MS = 86_400_000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export interface PeriodRange {
  from: number;
  to: number;
}

/** Inclusive time range for a period; custom uses `custom` (local dates). */
export const periodRange = (
  period: SessionPeriod,
  custom: { from: string; to: string },
  now = new Date()
): PeriodRange => {
  const today = startOfDay(now);

  switch (period) {
    case 'today':
      return { from: today, to: Infinity };
    case '7d':
      return { from: today - 6 * DAY_MS, to: Infinity };
    case '30d':
      return { from: today - 29 * DAY_MS, to: Infinity };
    case 'all':
      return { from: -Infinity, to: Infinity };
    case 'custom': {
      const from = custom.from
        ? new Date(`${custom.from}T00:00:00`).getTime()
        : -Infinity;
      const to = custom.to
        ? new Date(`${custom.to}T00:00:00`).getTime() + DAY_MS - 1
        : Infinity;

      return { from, to };
    }
  }
};

export const filterSessions = (sessions: GameSession[], range: PeriodRange) =>
  sessions.filter(session => {
    const started = new Date(session.startedAt).getTime();

    return started >= range.from && started <= range.to;
  });

export const sessionDurationMs = (session: GameSession) =>
  Math.max(
    0,
    new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
  );

export const sessionStats = (sessions: GameSession[]) => ({
  net:
    Math.round(sessions.reduce((sum, session) => sum + session.net, 0) * 100) /
    100,
  hands: sessions.reduce((sum, session) => sum + session.hands, 0),
  sessions: sessions.length,
  timeMs: sessions.reduce(
    (sum, session) => sum + sessionDurationMs(session),
    0
  ),
});

/** "18h 42m" / "25m". */
export const formatDuration = (ms: number) => {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};
