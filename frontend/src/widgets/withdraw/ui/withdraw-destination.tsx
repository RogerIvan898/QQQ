import { useLingui } from '@lingui/react/macro';
import { Wallet } from 'lucide-react';

import { Alert } from 'shared/ui/alert';
import { cn } from 'shared/utils/cn';
import { truncateMiddle } from 'shared/utils/format';

import { isValidTonAddress } from '../lib';
import type { WithdrawDestination } from '../model';

import styles from './withdraw.module.css';

interface Props {
  destination: WithdrawDestination;
  connectedAddress?: string;
  customAddress: string;
  onDestinationChange: (value: WithdrawDestination) => void;
  onCustomAddressChange: (value: string) => void;
  onConnectWallet: () => void;
}

export const WithdrawDestinationBlock = ({
  destination,
  connectedAddress,
  customAddress,
  onDestinationChange,
  onCustomAddressChange,
  onConnectWallet,
}: Props) => {
  const { t } = useLingui();
  const addressTouched = customAddress.trim().length > 0;
  const isAddressValid = isValidTonAddress(customAddress);
  const addressInvalid = addressTouched && !isAddressValid;

  return (
    <div className={styles.field}>
      <label className={styles.label}>{t`Destination`}</label>
      <div className={styles.tabs} role="tablist" aria-label={t`Destination`}>
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

      {/* Both panes share one grid cell and have the same shape (a notice +
          one control), so switching tabs doesn't jump or leave a gap. */}
      <div className={styles.destinationPanes}>
        <div
          className={cn(
            styles.pane,
            destination !== 'wallet' && styles.paneHidden
          )}
          inert={destination !== 'wallet'}
        >
          {connectedAddress ? (
            <div className={styles.walletCard}>
              <span className={styles.walletLabel}>{t`Withdraw to`}</span>
              <span className={styles.walletAddress} title={connectedAddress}>
                {truncateMiddle(connectedAddress, 6)}
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
          )}
        </div>

        <div
          className={cn(
            styles.pane,
            destination !== 'address' && styles.paneHidden
          )}
          inert={destination !== 'address'}
        >
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
              </div>
              {addressInvalid ? (
                <p className={styles.fieldError} role="alert">
                  {t`Enter a valid TON address`}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
