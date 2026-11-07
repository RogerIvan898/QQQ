import React from 'react';

import type { MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from '@tanstack/react-router';
import { useUnit } from 'effector-react';
import { ChevronLeft, ChevronRight, Spade } from 'lucide-react';

import {
  gameSessionsModel,
  type GameSession,
  type SessionPeriod,
} from 'features/game-sessions';
import { useTelegramBackButton } from 'shared/lib/telegram';
import { ChipGroup } from 'shared/ui/chip-group';
import { cn } from 'shared/utils/cn';

import { formatSignedTon } from '../lib/format';

import styles from './history-page.module.css';
import { useSessionTitle } from './use-session-title';

const PERIODS = [
  ['today', msg`Today`],
  ['7d', msg`7 Days`],
  ['30d', msg`30 Days`],
  ['all', msg`All Time`],
  ['custom', msg`Custom`],
] as const satisfies readonly (readonly [SessionPeriod, MessageDescriptor])[];

const {
  filterSessions,
  formatDuration,
  periodRange,
  sessionDurationMs,
  sessionStats,
} = gameSessionsModel;

interface CardProps {
  session: GameSession;
}

const SessionCard = ({ session }: CardProps) => {
  const { i18n } = useLingui();
  const title = useSessionTitle();
  // "Nov 7, 10:15 PM": the full range and buy-in/cash-out are on the details page.
  const shortTime = new Intl.DateTimeFormat(i18n.locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li>
      <Link
        to="/history/$sessionId"
        params={{ sessionId: session.id }}
        className={styles.card}
      >
        <div className={styles.cardMain}>
          <div className={styles.cardRow}>
            <span className={styles.cardTitle}>{title(session)}</span>
            <span
              className={cn(
                styles.profitValue,
                session.net > 0 && styles.positive,
                session.net < 0 && styles.negative
              )}
            >
              {formatSignedTon(session.net, i18n.locale)}
            </span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardMeta}>
              {shortTime.format(new Date(session.startedAt))}
            </span>
            <span className={styles.cardFlow}>
              {plural(session.hands, { one: '# hand', other: '# hands' })}
              {' · '}
              {formatDuration(sessionDurationMs(session))}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className={styles.chevron} />
      </Link>
    </li>
  );
};

/** Game History: results per table session (not wallet, not single hands). */
export const HistoryPage = () => {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  useTelegramBackButton(() => void navigate({ to: '/' }));
  const sessions = useUnit(gameSessionsModel.$sessions);
  const [period, setPeriod] = React.useState<SessionPeriod>('30d');
  const [custom, setCustom] = React.useState({ from: '', to: '' });

  const visible = filterSessions(sessions, periodRange(period, custom));
  const stats = sessionStats(visible);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backBtn} aria-label={t`Back`}>
          <ChevronLeft size={26} />
        </Link>
        <h1 className={styles.title}>{t`Game History`}</h1>
      </header>

      <div className={styles.scroll}>
        <ChipGroup
          className={styles.periods}
          items={PERIODS.map(([id, label]) => ({ id, label: i18n._(label) }))}
          value={period}
          onChange={setPeriod}
          label={t`Period`}
        />

        {period === 'custom' ? (
          <div className={styles.customRange}>
            <label>
              <span>{t`From`}</span>
              <input
                type="date"
                value={custom.from}
                max={custom.to || undefined}
                onChange={event =>
                  setCustom(value => ({ ...value, from: event.target.value }))
                }
              />
            </label>
            <label>
              <span>{t`To`}</span>
              <input
                type="date"
                value={custom.to}
                min={custom.from || undefined}
                onChange={event =>
                  setCustom(value => ({ ...value, to: event.target.value }))
                }
              />
            </label>
          </div>
        ) : null}

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.metricLabel}>{t`Hands Played`}</span>
            <span className={styles.statValue}>
              {new Intl.NumberFormat(i18n.locale).format(stats.hands)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.metricLabel}>{t`Sessions`}</span>
            <span className={styles.statValue}>{stats.sessions}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.metricLabel}>{t`Time Played`}</span>
            <span className={styles.statValue}>
              {formatDuration(stats.timeMs)}
            </span>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <Spade size={36} strokeWidth={1.5} />
            <span>
              {sessions.length === 0
                ? t`No game sessions yet. Sit at a table to start one.`
                : t`No sessions in this period`}
            </span>
          </div>
        ) : (
          <ul className={styles.list}>
            {visible.map(session => (
              <SessionCard key={session.id} session={session} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
