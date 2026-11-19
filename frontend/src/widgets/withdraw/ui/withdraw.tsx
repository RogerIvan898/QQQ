import { useActionState, useEffect, useRef, useState } from 'react';

import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { walletModel } from 'entities/wallet';
import { useDialogSession } from 'shared/hooks/use-dialog-session';
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
  onSuccess?: (payload: WithdrawPayload) => void;
}

export const WithdrawModal = (props: Props) => {
  const { mounted, key } = useDialogSession(props.open);

  return mounted ? <WithdrawSession key={key} {...props} /> : null;
};

const WithdrawSession = ({
  open,
  onClose,
  balance,
  onSubmit,
  onSuccess,
}: Props) => {
  const { t } = useLingui();
  const wallet = useUnit($tonWallet);
  const connectedAddress = wallet?.friendlyAddress ?? '';
  const savedAddress = useUnit(walletModel.$savedWithdrawAddress);
  const pending = useUnit(walletModel.$withdrawPending);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [draft, setDraft] = useState('');
  const amount = parseAmountDraft(draft) ?? 0;
  const [destination, setDestination] = useState<WithdrawDestination>(
    savedAddress ? 'address' : 'wallet'
  );
  const [customAddress, setCustomAddress] = useState(savedAddress ?? '');
  const targetAddress =
    destination === 'wallet' ? connectedAddress : customAddress.trim();
  const isAddressValid =
    destination === 'wallet'
      ? Boolean(connectedAddress)
      : isValidTonAddress(customAddress);
  const exceedsBalance = amount > balance;
  const submissionLocked = useRef(false);
  const [submitFailed, submitAction, submitting] = useActionState(async () => {
    if (
      !open ||
      !isAddressValid ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      exceedsBalance ||
      !onSubmit
    ) {
      submissionLocked.current = false;

      return false;
    }

    try {
      const payload = { amount, address: targetAddress, destination };
      await onSubmit(payload);

      if (mounted.current) {
        onSuccess?.(payload);
        onClose();
      }

      return false;
    } catch {
      return true;
    } finally {
      submissionLocked.current = false;
    }
  }, false);

  const canSubmit =
    open &&
    Boolean(onSubmit) &&
    isAddressValid &&
    Number.isFinite(amount) &&
    amount > 0 &&
    !exceedsBalance &&
    !submitting &&
    !pending;

  const submitLabel =
    destination === 'wallet' && !connectedAddress ? (
      t`Connect wallet to withdraw`
    ) : amount > 0 ? (
      <Trans id="Withdraw {amount, number} TON" values={{ amount }} />
    ) : (
      t`Withdraw`
    );

  const handleMax = () => {
    if (balance <= 0) {
      return;
    }

    setDraft(formatAmountDraft(balance));
  };

  const connectWallet = () => {
    void getTonConnectUI()
      .then(ui => ui.openModal())
      .catch(() => undefined);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t`Withdraw TON`}
      variant="bottom"
    >
      <form
        className={styles.content}
        action={submitAction}
        onSubmit={event => {
          if (!canSubmit || submissionLocked.current) {
            event.preventDefault();

            return;
          }

          submissionLocked.current = true;
        }}
      >
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
          onChange={setDraft}
          onMax={handleMax}
        />

        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={!canSubmit}
        >
          {submitting || pending ? t`Sending…` : submitLabel}
        </button>

        {submitFailed && !submitting ? (
          <p className={styles.submitError} role="alert">
            {t`Check your transaction history before retrying this withdrawal.`}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
};
