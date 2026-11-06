import { useLingui } from '@lingui/react/macro';

import { PayViaWalletButton } from 'features/pay-via-wallet';
import { Alert } from 'shared/ui/alert';
import { buildTonTransferLink } from 'widgets/deposit-dialog/utils';

import shared from '../../../deposit-dialog.module.css';
import { QrBlock } from '../qr-block';

import styles from './wallet-panel.module.css';

interface Props {
  amount: number;
  depositAddress: string;
  memo?: string;
  onSuccess?: () => void;
  onError: (message: string) => void;
}

export const WalletPanel = ({
  amount,
  depositAddress,
  memo,
  onSuccess,
  onError,
}: Props) => {
  const { t } = useLingui();

  const walletQrValue = buildTonTransferLink(depositAddress, amount, memo);

  return (
    <div
      id="payment-panel-wallet"
      role="tabpanel"
      aria-labelledby="payment-tab-wallet"
      tabIndex={0}
      className={styles.panel}
    >
      <Alert variant="info" title={t`Tonkeeper / Telegram Wallet`}>
        {t`Pay in one tap via TON Connect, or scan the QR with another phone.`}
      </Alert>

      <PayViaWalletButton
        className={shared.primaryBtn}
        amount={amount}
        depositAddress={depositAddress}
        memo={memo}
        onSuccess={onSuccess}
        onError={() => onError(t`Payment failed or rejected in wallet`)}
      />

      <div className={styles.orDivider}>{t`— or scan with Tonkeeper —`}</div>

      <QrBlock
        value={walletQrValue}
        hint={
          memo
            ? t`Full transfer link with address, amount and memo.`
            : t`Full transfer link with address and amount.`
        }
      />
    </div>
  );
};
