import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { Loader2, Wallet } from 'lucide-react';

import { useWalletPayment } from '../model/use-wallet-payment';

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

  const { hasWallet, isLoading, pay } = useWalletPayment({
    amount,
    depositAddress,
    memo,
    onSuccess,
    onError,
    onInvalidAmount: () => alert(t`Invalid amount`),
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
