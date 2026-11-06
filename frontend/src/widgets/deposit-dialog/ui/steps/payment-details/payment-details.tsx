import { useState } from 'react';

import { useLingui } from '@lingui/react/macro';

import { Alert } from 'shared/ui/alert';
import { cn } from 'shared/utils/cn';

import type { PaymentMethod } from '../../../types';
import { formatTonAmount } from '../../../utils';
import shared from '../../deposit-dialog.module.css';

import { ExchangePanel } from './exchange-panel';
import styles from './payment-details.module.css';
import { WalletPanel } from './wallet-panel';

interface Props {
  amount: number;
  depositAddress: string;
  memo?: string;
  onCopyText?: (text: string, type: 'address' | 'memo' | 'amount') => void;
  onSuccess?: () => void;
}

export const PaymentDetailsStep = ({
  amount,
  depositAddress,
  memo,
  onCopyText,
  onSuccess,
}: Props) => {
  const { t } = useLingui();

  const [method, setMethod] = useState<PaymentMethod>('wallet');
  const [error, setError] = useState<string | null>(null);

  const isWallet = method === 'wallet';

  const exchangeLabel = t`Exchange`;

  return (
    <div className={shared.content}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t`Payment method`}
      >
        <button
          id="payment-tab-wallet"
          type="button"
          role="tab"
          aria-selected={isWallet}
          aria-controls="payment-panel-wallet"
          tabIndex={isWallet ? 0 : -1}
          className={cn(styles.tab, isWallet && styles.tabActive)}
          onClick={() => setMethod('wallet')}
        >
          {t`Web3 wallet`}
        </button>
        <button
          id="payment-tab-exchange"
          type="button"
          role="tab"
          aria-selected={!isWallet}
          aria-controls="payment-panel-exchange"
          tabIndex={!isWallet ? 0 : -1}
          className={cn(styles.tab, !isWallet && styles.tabActive)}
          onClick={() => setMethod('exchange')}
        >
          {exchangeLabel}
        </button>
      </div>

      {error && (
        <Alert variant="error" title={t`Payment failed`}>
          {error}
        </Alert>
      )}

      {isWallet ? (
        <WalletPanel
          amount={amount}
          depositAddress={depositAddress}
          memo={memo}
          onSuccess={onSuccess}
          onError={setError}
        />
      ) : (
        <ExchangePanel
          amountText={formatTonAmount(amount)}
          depositAddress={depositAddress}
          memo={memo}
          onCopyText={onCopyText}
        />
      )}
    </div>
  );
};
