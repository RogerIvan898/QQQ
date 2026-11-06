import { useId } from 'react';
import type { PropsWithChildren } from 'react';

import { cn } from 'shared/utils/cn';

import styles from './setting.module.css';

interface Props {
  label: string;
  description?: string;
  className?: string;
}

export const Setting = ({
  label,
  description,
  className,
  children,
}: PropsWithChildren<Props>) => {
  const labelId = useId();

  return (
    <div className={cn(styles.setting, className)} aria-labelledby={labelId}>
      <div className={styles.settingHeader}>
        <span id={labelId} className={styles.settingLabel}>
          {label}
        </span>

        {description ? (
          <span className={styles.settingDescription}>{description}</span>
        ) : null}
      </div>

      <div className={styles.settingControl}>{children}</div>
    </div>
  );
};
