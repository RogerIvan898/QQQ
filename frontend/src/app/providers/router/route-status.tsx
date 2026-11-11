import { useLingui } from '@lingui/react/macro';

import { Button } from 'shared/ui/button';
import { Preloader } from 'shared/ui/preloader';

import styles from './route-status.module.css';

export const RoutePending = () => {
  const { t } = useLingui();

  return <Preloader label={t`Loading…`} />;
};

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
