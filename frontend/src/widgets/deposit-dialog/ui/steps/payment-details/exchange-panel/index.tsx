import { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { ChevronDown, QrCode } from 'lucide-react';

import { CopyField } from 'shared/ui/copy-field';

import { QrBlock } from '../qr-block';

import styles from './exchange-panel.module.css';

interface Props {
  amountText: string;
  depositAddress: string;
  memo?: string;
  onCopyText?: (text: string, type: 'address' | 'memo' | 'amount') => void;
}

export const ExchangePanel = ({
  amountText,
  depositAddress,
  memo,
  onCopyText,
}: Props) => {
  const { t } = useLingui();

  const requiredLabel = t`Required`;
  const [showQr, setShowQr] = useState(false);

  return (
    <div
      id="payment-panel-exchange"
      role="tabpanel"
      aria-labelledby="payment-tab-exchange"
      tabIndex={0}
      className={styles.panel}
    >
      <div className={styles.copyFields}>
        <CopyField
          label={t`Wallet address`}
          value={depositAddress}
          onCopy={() => onCopyText?.(depositAddress, 'address')}
        />

        {memo && (
          <CopyField
            label={t`Memo`}
            value={memo}
            badgeText={requiredLabel}
            hint={t`Without the memo an exchange deposit will not be credited.`}
            onCopy={() => onCopyText?.(memo, 'memo')}
          />
        )}

        <CopyField
          label={t`Amount (TON)`}
          value={amountText}
          onCopy={() => onCopyText?.(amountText, 'amount')}
        />
      </div>

      <button
        type="button"
        className={styles.qrToggle}
        aria-expanded={showQr}
        onClick={() => setShowQr(open => !open)}
      >
        <QrCode size={16} />
        {showQr ? t`Hide QR code` : t`Show QR code`}
        <ChevronDown
          size={16}
          className={showQr ? styles.chevronOpen : styles.chevron}
        />
      </button>

      {showQr ? (
        <div className={styles.qrWrap}>
          <QrBlock
            value={depositAddress}
            hint={t`Address only — easy for exchange scanners to read.`}
          />
        </div>
      ) : null}
    </div>
  );
};
