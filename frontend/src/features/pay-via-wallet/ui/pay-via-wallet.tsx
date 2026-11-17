import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { Loader2, Wallet } from 'lucide-react';

import {
  $hasPaymentWallet,
  $walletPaymentPending,
  walletPaymentRequested,
} from '../model';

interface Props {
  amount: number;
  depositAddress: string;
  memo?: string;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  className?: string;
}

export const PayViaWalletButton = ({
  amount,
  depositAddress,
  memo,
  onSuccess,
  onError,
  className,
}: Props) => {
  const { t } = useLingui();

  const [hasWallet, isLoading, requestPayment] = useUnit([
    $hasPaymentWallet,
    $walletPaymentPending,
    walletPaymentRequested,
  ]);

  const pay = () =>
    requestPayment({
      amount,
      depositAddress,
      memo,
      onSuccess,
      onError,
    });

  return (
    <button
      type="button"
      className={className}
      onClick={pay}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 size={20} /> : <Wallet size={20} />}
      {hasWallet ? (
        isLoading ? (
          t`Confirm in wallet…`
        ) : (
          <Trans
            id="Pay {amount, number} TON with wallet"
            values={{ amount }}
          />
        )
      ) : (
        <Trans
          id="Connect wallet and pay {amount, number} TON"
          values={{ amount }}
        />
      )}
    </button>
  );
};
