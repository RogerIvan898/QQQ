import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';

import { walletModel } from 'entities/wallet';
import { Dialog } from 'shared/ui/dialog';
import { Preloader } from 'shared/ui/preloader';

import styles from './main-menu.module.css';

const DepositDialog = React.lazy(() =>
  import('widgets/deposit-dialog').then(module => ({
    default: module.DepositDialog,
  }))
);

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const DepositEntry = ({ onClose, onSuccess }: Props) => {
  const { t } = useLingui();
  const [address, status, request] = useUnit([
    walletModel.$depositAddress,
    walletModel.$depositAddressStatus,
    walletModel.depositAddressRequested,
  ]);

  React.useEffect(() => {
    request();
  }, [request]);

  if (address) {
    return (
      <React.Suspense fallback={null}>
        <DepositDialog
          open
          onClose={onClose}
          onSuccess={onSuccess}
          depositAddress={address.address}
          memo={address.memo}
        />
      </React.Suspense>
    );
  }

  return (
    <Dialog open variant="bottom" title={t`Deposit TON`} onClose={onClose}>
      <div className={styles.roomsState}>
        {status === 'failed' ? (
          <>
            <span>{t`Couldn't load your deposit address`}</span>
            <button
              type="button"
              className={styles.roomsRetry}
              onClick={() => request()}
            >
              {t`Retry`}
            </button>
          </>
        ) : (
          <Preloader label={t`Loading…`} />
        )}
      </div>
    </Dialog>
  );
};
