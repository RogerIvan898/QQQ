import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useStoreMap } from 'effector-react';
import { ChevronLeft } from 'lucide-react';

import { gameSessionsModel } from 'features/game-sessions';
import {
  hasTelegramBackButton,
  useTelegramBackButton,
} from 'shared/lib/telegram';
import { cn } from 'shared/utils/cn';

import { formatSessionTime, formatSignedTon, formatTon } from '../lib/format';

import styles from './history-page.module.css';
import { useSessionTitle } from './use-session-title';

export const SessionDetailsPage = () => {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const { sessionId } = useParams({ from: '/history_/$sessionId' });
  useTelegramBackButton(() => void navigate({ to: '/history' }));
  const title = useSessionTitle();
  const session = useStoreMap({
    store: gameSessionsModel.$sessions,
    keys: [sessionId],
    fn: (sessions, [id]) => sessions.find(item => item.id === id) ?? null,
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {!hasTelegramBackButton() && (
          <Link to="/history" className={styles.backBtn} aria-label={t`Back`}>
            <ChevronLeft size={26} />
          </Link>
        )}
        <h1 className={styles.title}>{t`Session Details`}</h1>
      </header>

      <div className={styles.scroll}>
        {!session ? (
          <div className={styles.empty}>{t`Session not found`}</div>
        ) : (
          <>
            <div className={styles.hero}>
              <span className={styles.heroTitle}>{title(session)}</span>
              <span className={styles.cardTime}>
                {formatSessionTime(
                  session.startedAt,
                  session.endedAt,
                  i18n.locale
                )}
              </span>
              <span className={styles.metricLabel}>{t`Net Profit`}</span>
              <span
                className={cn(
                  styles.heroValue,
                  session.net > 0 && styles.positive,
                  session.net < 0 && styles.negative
                )}
              >
                {formatSignedTon(session.net, i18n.locale)}
              </span>
            </div>

            <h2 className={styles.sectionTitle}>{t`Session Overview`}</h2>
            <dl className={styles.overview}>
              <div>
                <dt>{t`Table ID`}</dt>
                <dd>#{session.roomId}</dd>
              </div>
              <div>
                <dt>{t`Game Type`}</dt>
                <dd>{t`Cash Game`}</dd>
              </div>
              <div>
                <dt>{t`Stakes`}</dt>
                <dd>{session.blinds ? `${session.blinds} TON` : '—'}</dd>
              </div>
              <div>
                <dt>{t`Format`}</dt>
                <dd>{session.format ?? '—'}</dd>
              </div>
              <div>
                <dt>{t`Hands`}</dt>
                <dd>{session.hands}</dd>
              </div>
              <div>
                <dt>{t`Duration`}</dt>
                <dd>
                  {gameSessionsModel.formatDuration(
                    gameSessionsModel.sessionDurationMs(session)
                  )}
                </dd>
              </div>
              <div>
                <dt>{t`Total Buy-in`}</dt>
                <dd>{formatTon(session.buyIn, i18n.locale)}</dd>
              </div>
              <div>
                <dt>{t`Cash out`}</dt>
                <dd>{formatTon(session.cashOut, i18n.locale)}</dd>
              </div>
              <div>
                <dt>{t`Net Profit`}</dt>
                <dd
                  className={cn(
                    session.net > 0 && styles.positive,
                    session.net < 0 && styles.negative
                  )}
                >
                  {formatSignedTon(session.net, i18n.locale)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </div>
  );
};
