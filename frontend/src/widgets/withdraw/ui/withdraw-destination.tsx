import { useLingui } from '@lingui/react/macro';

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

      {/* Both panes have the same shape (one 56px control + one hint line),
          so switching tabs neither jumps nor leaves empty space. */}
      <div className={styles.destinationPanes}>
        <div
          className={cn(
            styles.pane,
            destination !== 'wallet' && styles.paneHidden
          )}
          inert={destination !== 'wallet'}
        >
          {connectedAddress ? (
            <div className={cn(styles.walletCard, styles.destControl)}>
              <span className={styles.walletLabel}>{t`Withdraw to`}</span>
              <span className={styles.walletAddress} title={connectedAddress}>
                {truncateMiddle(connectedAddress, 6)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={cn(styles.secondaryBtn, styles.destControl)}
              onClick={onConnectWallet}
            >
              {t`Connect wallet`}
            </button>
          )}
          <p className={styles.destHint}>
            {connectedAddress
              ? t`Funds go to your connected wallet`
              : t`Connect a wallet to withdraw in one tap`}
          </p>
        </div>

        <div
          className={cn(
            styles.pane,
            destination !== 'address' && styles.paneHidden
          )}
          inert={destination !== 'address'}
        >
          <div
            className={cn(
              styles.addressBox,
              styles.destControl,
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
          <p
            className={cn(
              styles.destHint,
              addressInvalid ? styles.destHintError : styles.destHintWarning
            )}
            role={addressInvalid ? 'alert' : undefined}
          >
            {addressInvalid
              ? t`Enter a valid TON address`
              : t`Withdrawals are irreversible. Double-check it's a TON address.`}
          </p>
        </div>
      </div>
    </div>
  );
};
