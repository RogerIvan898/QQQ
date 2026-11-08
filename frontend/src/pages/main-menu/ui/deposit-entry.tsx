import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { Loader2 } from 'lucide-react';

import { walletModel } from 'entities/wallet';
import { Dialog } from 'shared/ui/dialog';

import styles from './deposit-entry.module.css';

const DepositDialog = React.lazy(() =>
  import('widgets/deposit-dialog').then(module => ({
    default: module.DepositDialog,
  }))
);

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

interface LoadingProps {
  onClose: () => void;
  failed?: boolean;
  onRetry?: () => void;
}

const DepositLoading = ({ onClose, failed, onRetry }: LoadingProps) => {
  const { t } = useLingui();

  return (
    <Dialog open variant="bottom" title={t`Deposit TON`} onClose={onClose}>
      {failed ? (
        <div className={styles.state} role="alert">
          <span>{t`Couldn't load your deposit address`}</span>
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t`Retry`}
          </button>
        </div>
      ) : (
        <div className={styles.state} role="status">
          <Loader2 size={24} className={styles.spin} />
          <span>{t`Loading…`}</span>
        </div>
      )}
    </Dialog>
  );
};

export const DepositEntry = ({ onClose, onSuccess }: Props) => {
  const [address, status, request] = useUnit([
    walletModel.$depositAddress,
    walletModel.$depositAddressStatus,
    walletModel.depositAddressRequested,
  ]);

  React.useEffect(() => {
    request();
  }, [request]);

  if (!address) {
    return (
      <DepositLoading
        onClose={onClose}
        failed={status === 'failed'}
        onRetry={() => request()}
      />
    );
  }

  return (
    <React.Suspense fallback={<DepositLoading onClose={onClose} />}>
      <DepositDialog
        open
        skipEnter
        onClose={onClose}
        onSuccess={onSuccess}
        depositAddress={address.address}
        memo={address.memo}
      />
    </React.Suspense>
  );
};
