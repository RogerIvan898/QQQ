import { useEffect, useState } from 'react';

import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { $tonWallet, getTonConnectUI } from 'shared/lib/ton-connect';
import { Dialog } from 'shared/ui/dialog';

import { formatAmountDraft, isValidTonAddress, parseAmountDraft } from '../lib';
import type { WithdrawDestination, WithdrawPayload } from '../model';

import { WithdrawAmountField } from './withdraw-amount-field';
import { WithdrawDestinationBlock } from './withdraw-destination';
import styles from './withdraw.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  balance: number;

  onSubmit?: (payload: WithdrawPayload) => Promise<unknown> | void;
}

export const WithdrawModal = ({ open, onClose, balance, onSubmit }: Props) => {
  const { t } = useLingui();
  const wallet = useUnit($tonWallet);
  const connectedAddress = wallet?.friendlyAddress ?? '';

  const [amount, setAmount] = useState(0);
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<WithdrawDestination>('wallet');
  const [customAddress, setCustomAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setDestination('wallet');
    }
  }, [open]);

  const targetAddress =
    destination === 'wallet' ? connectedAddress : customAddress.trim();
  const isAddressValid =
    destination === 'wallet'
      ? Boolean(connectedAddress)
      : isValidTonAddress(customAddress);
  const exceedsBalance = amount > balance;
  const canSubmit =
    isAddressValid && amount > 0 && !exceedsBalance && !submitting;

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

  const handleClose = () => {
    onClose();
    setAmount(0);
    setDraft('');
    setCustomAddress('');
    setSubmitFailed(false);
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

  const connectWallet = () => {
    void getTonConnectUI()
      .then(ui => ui.openModal())
      .catch(() => undefined);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setSubmitFailed(false);

    try {
      await onSubmit?.({
        amount,
        address: targetAddress,
        destination,
      });
      handleClose();
    } catch {
      setSubmitFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t`Withdraw TON`}
      variant="bottom"
    >
      <div className={styles.content}>
        <WithdrawDestinationBlock
          destination={destination}
          wallet={wallet}
          customAddress={customAddress}
          onDestinationChange={setDestination}
          onCustomAddressChange={setCustomAddress}
          onConnectWallet={connectWallet}
        />

        <WithdrawAmountField
          draft={draft}
          exceedsBalance={exceedsBalance}
          balance={balance}
          onChange={handleAmountChange}
          onMax={handleMax}
        />

        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting ? t`Sending…` : submitLabel}
        </button>

        {submitFailed ? (
          <p className={styles.submitError} role="alert">
            {t`The withdrawal didn't go through. Your balance is unchanged; try again.`}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
};
