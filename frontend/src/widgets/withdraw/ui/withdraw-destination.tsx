import { useLingui } from '@lingui/react/macro';
import { Wallet } from 'lucide-react';

import type { TonWalletInfo } from 'shared/lib/ton-connect';
import { Alert } from 'shared/ui/alert';
import { cn } from 'shared/utils/cn';
import { truncateMiddle } from 'shared/utils/format';

import { isValidTonAddress } from '../lib';
import type { WithdrawDestination } from '../model';

import styles from './withdraw.module.css';

interface Props {
  destination: WithdrawDestination;
  wallet: TonWalletInfo | null;
  customAddress: string;
  onDestinationChange: (value: WithdrawDestination) => void;
  onCustomAddressChange: (value: string) => void;
  onConnectWallet: () => void;
}

export const WithdrawDestinationBlock = ({
  destination,
  wallet,
  customAddress,
  onDestinationChange,
  onCustomAddressChange,
  onConnectWallet,
}: Props) => {
  const { t } = useLingui();
  const addressInvalid =
    customAddress.trim().length > 0 && !isValidTonAddress(customAddress);

  const canPaste = typeof navigator.clipboard?.readText === 'function';

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();

      onCustomAddressChange(text.trim());
    } catch {
      void 0;
    }
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t`Withdraw to`}</span>
      <div className={styles.tabs} role="tablist" aria-label={t`Withdraw to`}>
        <button
          type="button"
          role="tab"
          aria-selected={destination === 'wallet'}
          className={cn(
            styles.tab,
            destination === 'wallet' && styles.tabActive
          )}
          onClick={() => onDestinationChange('wallet')}
        >
          {t`My wallet`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={destination === 'address'}
          className={cn(
            styles.tab,
            destination === 'address' && styles.tabActive
          )}
          onClick={() => onDestinationChange('address')}
        >
          {t`Address`}
        </button>
      </div>

      {destination === 'wallet' ? (
        wallet ? (
          <div className={styles.walletCard}>
            <span className={styles.walletIcon}>
              {wallet.imageUrl ? (
                <img src={wallet.imageUrl} alt="" />
              ) : (
                <Wallet size={20} />
              )}
            </span>
            <span className={styles.walletInfo}>
              <span className={styles.walletName}>
                {wallet.name ?? t`TON wallet`}
              </span>
              <span
                className={styles.walletAddress}
                title={wallet.friendlyAddress}
              >
                {truncateMiddle(wallet.friendlyAddress, 6)}
              </span>
            </span>
          </div>
        ) : (
          <div className={styles.paneStack}>
            <Alert variant="info" title={t`Wallet not connected`}>
              {t`Connect a wallet to withdraw in one tap`}
            </Alert>
            <button
              type="button"
              className={styles.connectBtn}
              onClick={onConnectWallet}
            >
              <Wallet size={16} />
              {t`Connect wallet`}
            </button>
          </div>
        )
      ) : (
        <div className={styles.paneStack}>
          <Alert variant="warning" title={t`Double-check the TON address`}>
            {t`Withdrawals are irreversible. Send only to a TON address — a wrong network or typo means permanent loss of funds.`}
          </Alert>

          <div>
            <div
              className={cn(
                styles.addressBox,
                addressInvalid && styles.fieldInvalid
              )}
            >
              <input
                className={styles.addressInput}
                value={customAddress}
                onChange={e => onCustomAddressChange(e.target.value)}
                placeholder="UQ..."
                spellCheck={false}
                autoComplete="off"
                aria-label={t`TON address`}
              />
              {canPaste ? (
                <button
                  type="button"
                  className={styles.pasteBtn}
                  onClick={() => void paste()}
                >
                  {t`Paste`}
                </button>
              ) : null}
            </div>
            {addressInvalid ? (
              <p className={styles.fieldError} role="alert">
                {t`Enter a valid TON address`}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
