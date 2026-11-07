import { useLingui } from '@lingui/react/macro';

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

      {/* Both panes share one grid cell: the card is always as tall as the
          larger one, so switching tabs doesn't make it jump. */}
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
            <div className={styles.connectBlock}>
              <p className={styles.connectText}>
                {t`Connect a wallet to withdraw in one tap`}
              </p>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onConnectWallet}
              >
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
          <div className={styles.addressSection}>
            <div className={styles.warningWrap}>
              <Alert variant="warning" title={t`Double-check the TON address`}>
                {t`Withdrawals are irreversible. Send only to a TON address — a wrong network or typo means permanent loss of funds.`}
              </Alert>
            </div>

            <div
              className={cn(
                styles.addressBox,
                addressTouched && !isAddressValid && styles.fieldInvalid
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

            {/* Always rendered so showing the error doesn't change the height. */}
            <p
              className={cn(
                styles.fieldError,
                !(addressTouched && !isAddressValid) && styles.fieldErrorIdle
              )}
              aria-hidden={!(addressTouched && !isAddressValid)}
            >
              {t`Enter a valid TON address`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
