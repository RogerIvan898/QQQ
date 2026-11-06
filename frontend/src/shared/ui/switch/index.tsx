import { cn } from 'shared/utils/cn';

import styles from './switch.module.css';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

export const Switch = ({
  checked,
  onChange,
  disabled = false,
  label,
  className,
}: Props) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={cn(styles.control, className)}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.knob} />
  </button>
);
