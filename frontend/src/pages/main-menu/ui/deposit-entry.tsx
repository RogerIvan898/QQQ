import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { Loader2 } from 'lucide-react';

import { sessionModel } from 'entities/session';
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
  error?: string;
  onRetry?: () => void;
}

const DepositLoading = ({ onClose, error, onRetry }: LoadingProps) => {
  const { t } = useLingui();

  return (
    <Dialog
      open
      variant="bottom"
      title={t`Deposit TON`}
      titleAddon={<span>1/2</span>}
      onClose={onClose}
    >
      {error ? (
        <div className={styles.state} role="alert">
          <span>{error}</span>
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
  const { t } = useLingui();
  const [address, status, request, auth, retryAuth] = useUnit([
    walletModel.$depositAddress,
    walletModel.$depositAddressStatus,
    walletModel.depositAddressRequested,
    sessionModel.$authStatus,
    sessionModel.authRetryRequested,
  ]);

  React.useEffect(() => {
    if (auth === 'ready') request();
  }, [auth, request]);

  if (auth !== 'ready') {
    return (
      <DepositLoading
        onClose={onClose}
        error={auth === 'failed' ? t`Couldn't sign in` : undefined}
        onRetry={retryAuth}
      />
    );
  }

  if (!address) {
    return (
      <DepositLoading
        onClose={onClose}
        error={
          status === 'failed'
            ? t`Couldn't load your deposit address`
            : undefined
        }
        onRetry={request}
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
