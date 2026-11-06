import { Trans, useLingui } from '@lingui/react/macro';

import { Alert } from 'shared/ui/alert';
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

  return (
    <div
      id="payment-panel-exchange"
      role="tabpanel"
      aria-labelledby="payment-tab-exchange"
      tabIndex={0}
      className={styles.panel}
    >
      <Alert variant="warning" title={t`Memo`}>
        <Trans>
          When withdrawing from an exchange (Bybit, OKX, Binance), you must
          include the Memo. Without it the deposit will not be credited.
        </Trans>
      </Alert>

      <QrBlock
        value={depositAddress}
        hint={t`Address only — easy for exchange scanners to read.`}
      />

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
            onCopy={() => onCopyText?.(memo, 'memo')}
          />
        )}

        <CopyField
          label={t`Amount (TON)`}
          value={amountText}
          onCopy={() => onCopyText?.(amountText, 'amount')}
        />
      </div>
    </div>
  );
};
