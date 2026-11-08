import { useLingui } from '@lingui/react/macro';
import { Play } from 'lucide-react';

import { sitIn } from '../../model';

import styles from './sit-out-notice.module.css';

interface Props {
  returning: boolean;
}

export const SitOutNotice = ({ returning }: Props) => {
  const { t } = useLingui();

  return (
    <div className={styles.notice} role="status">
      <div className={styles.text}>
        <span className={styles.title}>{t`You are sitting out`}</span>
        <span className={styles.subtitle}>
          {returning
            ? t`You will be dealt in from the next hand`
            : t`Your seat and stack are kept`}
        </span>
      </div>
      {returning ? null : (
        <button
          type="button"
          className={styles.returnBtn}
          onClick={() => sitIn()}
        >
          <Play size={15} strokeWidth={2.5} />
          {t`Return to game`}
        </button>
      )}
    </div>
  );
};
