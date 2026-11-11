import { useLingui } from '@lingui/react/macro';

import { PayViaWalletButton, WrongNetworkError } from 'features/pay-via-wallet';
import { IS_TESTNET } from 'shared/config/ton-network';
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
      <PayViaWalletButton
        className={shared.primaryBtn}
        amount={amount}
        depositAddress={depositAddress}
        memo={memo}
        onSuccess={onSuccess}
        onError={error =>
          onError(
            error instanceof WrongNetworkError
              ? IS_TESTNET
                ? t`Your wallet is on mainnet. Switch it to testnet and try again.`
                : t`Your wallet is on testnet. Switch it to mainnet and try again.`
              : t`Payment failed or rejected in wallet`
          )
        }
      />

      <p className={styles.subtitle}>
        {t`Tonkeeper, Telegram Wallet and other TON wallets`}
      </p>

      <div className={styles.orDivider}>
        <span>{t`or scan the QR code`}</span>
      </div>

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
