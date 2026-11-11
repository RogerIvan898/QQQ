import { useId, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Check, Copy, Info } from 'lucide-react';

import { useCopyToClipboard } from 'shared/lib/clipboard';
import { cn } from 'shared/utils/cn';
import { truncateMiddle } from 'shared/utils/format';

import styles from './copy-field.module.css';

const COPIED_RESET_MS = 2000;

const SHORTEN_FROM = 24;

interface Props {
  label: string;
  value: string;
  badgeText?: string;
  hint?: string;
  info?: string;
  onCopy?: (value: string) => void;
}

export const CopyField = ({
  label,
  value,
  badgeText,
  hint,
  info,
  onCopy,
}: Props) => {
  const { t } = useLingui();
  const { copied, copy } = useCopyToClipboard(COPIED_RESET_MS);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();

  const shown = value.length > SHORTEN_FROM ? truncateMiddle(value, 8) : value;

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
        <span className={styles.labelRow}>
          {label}
          {info ? (
            <button
              type="button"
              className={cn(styles.infoBtn, infoOpen && styles.infoBtnOn)}
              aria-expanded={infoOpen}
              aria-controls={infoId}
              aria-label={t`What is ${label}?`}
              onClick={() => setInfoOpen(open => !open)}
            >
              <Info size={14} />
            </button>
          ) : null}
        </span>
        {badgeText && <b>{badgeText}</b>}
      </div>
      {info && infoOpen ? (
        <p id={infoId} className={styles.info}>
          {info}
        </p>
      ) : null}
      <button
        type="button"
        className={cn(styles.fieldBox, copied && styles.copied)}
        onClick={() => void handleCopy()}
        title={value}
        aria-label={`${label}: ${value}. ${copied ? t`Copied` : t`Copy`}`}
      >
        <span className={styles.text}>{shown}</span>
        <span className={styles.copyBtn} aria-hidden="true">
          {copied ? <Check size={15} strokeWidth={2.75} /> : <Copy size={15} />}
          <span className={styles.copyLabel}>
            {copied ? t`Copied` : t`Copy`}
          </span>
        </span>
      </button>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
};
