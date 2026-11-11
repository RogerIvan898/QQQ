import type { ReactNode } from 'react';

import { cn } from 'shared/utils/cn';

import styles from './settings-dialog.module.css';

interface Props {
  icon: ReactNode;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow = ({ icon, label, checked, onChange }: Props) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    className={styles.toggleRow}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.toggleIcon} aria-hidden="true">
      {icon}
    </span>

    <span className={styles.toggleText}>{label}</span>

    <span
      className={cn(styles.switchTrack, checked && styles.switchTrackOn)}
      aria-hidden="true"
    >
      <span className={styles.switchThumb} />
    </span>
  </button>
);
