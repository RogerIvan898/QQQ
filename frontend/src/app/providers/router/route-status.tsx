import { useLingui } from '@lingui/react/macro';

import { Button } from 'shared/ui/button';
import { Preloader } from 'shared/ui/preloader';

import styles from './route-status.module.css';

/** Shown while a lazily split route chunk is still downloading. */
export const RoutePending = () => {
  const { t } = useLingui();

  return <Preloader label={t`Loading…`} />;
};

/** Shown when a route chunk fails to load, e.g. on a flaky connection. */
export const RouteError = () => {
  const { t } = useLingui();

  return (
    <div className={styles.error} role="alert">
      <p className={styles.title}>{t`Couldn't load the page`}</p>
      <p className={styles.hint}>{t`Check your connection and try again.`}</p>
      <Button
        color="primary"
        text={t`Retry`}
        onClick={() => window.location.reload()}
      />
    </div>
  );
};
