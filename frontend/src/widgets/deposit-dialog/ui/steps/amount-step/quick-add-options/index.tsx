import { useLingui } from '@lingui/react/macro';
import { Plus } from 'lucide-react';

import styles from './quick-add-options.module.css';

interface Props {
  options: number[];
  onAdd: (value: number) => void;
  disabled?: boolean;
}

export const QuickAddOptions = ({ options, onAdd, disabled }: Props) => {
  const { t } = useLingui();

  return (
    <div
      className={styles.quickAmounts}
      role="group"
      aria-label={t`Quick add amount`}
    >
      {options.map(value => (
        <button
          key={value}
          type="button"
          className={styles.quickBtn}
          onClick={() => onAdd(value)}
          disabled={disabled}
        >
          <span className={styles.quickBtnContent}>
            <span className={styles.quickBtnIcon} aria-hidden="true">
              <Plus size={16} strokeWidth={2.5} />
            </span>
            <span className={styles.quickBtnValue}>
              {value} <span className={styles.quickBtnUnit}>TON</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};
