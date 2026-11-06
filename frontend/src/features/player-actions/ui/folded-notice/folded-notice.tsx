import { Trans } from '@lingui/react/macro';

import styles from './folded-notice.module.css';

export const FoldedNotice = () => (
  <div className={styles.notice} role="status">
    <span className={styles.title}>
      <Trans>You folded</Trans>
    </span>
    <span className={styles.subtitle}>
      <Trans>Waiting for next hand...</Trans>
    </span>
  </div>
);
