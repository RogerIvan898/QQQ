import { Copy, Check } from 'lucide-react';

import { useCopyToClipboard } from 'shared/lib/clipboard';

import styles from './copy-field.module.css';

const COPIED_RESET_MS = 2000;

interface Props {
  label: string;
  value: string;
  badgeText?: string;
  hint?: string;
  onCopy?: (value: string) => void;
}

export const CopyField = ({ label, value, badgeText, hint, onCopy }: Props) => {
  const { copied, copy } = useCopyToClipboard(COPIED_RESET_MS);

  const handleCopy = async () => {
    try {
      await copy(value);
      onCopy?.(value);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className={styles.fieldGroup}>
      <div className={styles.fieldHeader}>
        <span>{label}</span>
        {badgeText && <b>{badgeText}</b>}
      </div>
      <div className={styles.fieldBox}>
        <span className={styles.text}>{value}</span>
        <button
          className={styles.copyBtn}
          onClick={() => void handleCopy()}
          type="button"
          aria-label={copied ? 'Скопировано' : 'Скопировать'}
          title={copied ? 'Скопировано' : 'Скопировать'}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
};
