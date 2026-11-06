import { useEffect, useState } from 'react';

import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';

import { Dialog } from 'shared/ui/dialog';
import { formatBalance } from 'shared/utils/format';

import { formatAmountDraft, isValidTonAddress, parseAmountDraft } from '../lib';
import type { WithdrawDestination, WithdrawPayload } from '../model';

import { WithdrawAmountField } from './withdraw-amount-field';
import { WithdrawDestinationBlock as DestinationBlock } from './withdraw-destination';
import styles from './withdraw.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  balance: number;
  onSubmit?: (payload: WithdrawPayload) => void;
}

export const WithdrawModal = ({ open, onClose, balance, onSubmit }: Props) => {
  const { t, i18n } = useLingui();
  const connectedAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [amount, setAmount] = useState(0);
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<WithdrawDestination>('wallet');
  const [customAddress, setCustomAddress] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setDestination(connectedAddress ? 'wallet' : 'address');
  }, [open, connectedAddress]);

  const formattedBalance = formatBalance(balance, i18n.locale);

  const targetAddress =
    destination === 'wallet' ? connectedAddress : customAddress.trim();

  const exceedsBalance = amount > balance;
  const isAmountValid = amount > 0 && !exceedsBalance;
  const isAddressValid =
    destination === 'wallet'
      ? Boolean(connectedAddress)
      : isValidTonAddress(customAddress);

  const canSubmit = isAmountValid && isAddressValid;

  const submitLabel =
    destination === 'wallet' && !connectedAddress ? (
      t`Connect wallet to withdraw`
    ) : amount > 0 ? (
      <Trans
        id="Withdraw {amount, number} TON"
        message="Withdraw {amount, number} TON"
        values={{ amount }}
      />
    ) : (
      t`Withdraw`
    );

  const resetForm = () => {
    setAmount(0);
    setDraft('');
    setCustomAddress('');
    setDestination(connectedAddress ? 'wallet' : 'address');
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const handleAmountChange = (value: string) => {
    setDraft(value);

    const parsed = parseAmountDraft(value);

    if (parsed !== null) {
      setAmount(parsed);
    }
  };

  const handleMax = () => {
    if (balance <= 0) {
      return;
    }

    setAmount(balance);
    setDraft(formatAmountDraft(balance));
  };

  const handleSubmit = () => {
    if (!canSubmit || !targetAddress) {
      return;
    }

    onSubmit?.({
      amount,
      address: targetAddress,
      destination,
    });

    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t`Withdraw TON`}
      variant="bottom"
    >
      <div className={styles.content}>
        <button
          type="button"
          className={styles.balanceCard}
          onClick={handleMax}
          disabled={balance <= 0}
        >
          <span className={styles.balanceLabel}>{t`Available balance`}</span>
          <span className={styles.balanceValue}>{formattedBalance} TON</span>
          <span className={styles.balanceHint}>{t`Tap to use max`}</span>
        </button>

        <WithdrawAmountField
          draft={draft}
          exceedsBalance={exceedsBalance}
          balance={balance}
          onChange={handleAmountChange}
          onMax={handleMax}
        />

        <DestinationBlock
          destination={destination}
          connectedAddress={connectedAddress || undefined}
          customAddress={customAddress}
          onDestinationChange={setDestination}
          onCustomAddressChange={setCustomAddress}
          onConnectWallet={() => void tonConnectUI.openModal()}
        />

        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </Dialog>
  );
};
