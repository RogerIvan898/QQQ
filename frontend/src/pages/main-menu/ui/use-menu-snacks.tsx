import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { BookmarkPlus, Wallet } from 'lucide-react';

import { walletModel } from 'entities/wallet';
import { Snackbar } from 'shared/ui/snackbar';
import { formatBalance, truncateMiddle } from 'shared/utils/format';

export const useShortfallSnack = (onTopUp: () => void) => {
  const { t, i18n } = useLingui();
  const [open, setOpen] = React.useState(false);
  const [missing, setMissing] = React.useState(0);
  const [showId, setShowId] = React.useState(0);

  const show = (amount: number) => {
    setMissing(amount);
    setShowId(id => id + 1);
    setOpen(true);
  };

  const missingLabel = `${formatBalance(missing, i18n.locale)} TON`;

  const snack = (
    <Snackbar
      open={open}
      onClose={() => setOpen(false)}
      tone="warning"
      showId={showId}
      icon={<Wallet size={18} />}
      message={
        <>
          {t`Not enough balance.`} <b>{t`Top up ${missingLabel}`}</b>
        </>
      }
      actionLabel={t`Top up`}
      onAction={() => {
        setOpen(false);
        onTopUp();
      }}
    />
  );

  return { show, snack };
};

export const useSaveAddressOffer = () => {
  const { t } = useLingui();
  const [open, setOpen] = React.useState(false);
  const [candidate, setCandidate] = React.useState('');
  const [showId, setShowId] = React.useState(0);
  const [savedAddress, saveAddress] = useUnit([
    walletModel.$savedWithdrawAddress,
    walletModel.withdrawAddressSaved,
  ]);

  const offer = (address: string) => {
    if (address === savedAddress) {
      return;
    }

    setCandidate(address);
    setShowId(id => id + 1);
    setOpen(true);
  };

  const shortAddress = truncateMiddle(candidate, 4);

  const snack = (
    <Snackbar
      open={open}
      onClose={() => setOpen(false)}
      showId={showId}
      durationMs={8000}
      icon={<BookmarkPlus size={18} />}
      message={t`Save ${shortAddress} for next withdrawals?`}
      actionLabel={t`Save`}
      onAction={() => {
        saveAddress(candidate);
        setOpen(false);
      }}
    />
  );

  return { offer, snack };
};
