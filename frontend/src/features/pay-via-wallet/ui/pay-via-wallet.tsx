import { useState } from 'react';

import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { beginCell, toNano } from '@ton/core';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Loader2, Wallet } from 'lucide-react';

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
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (!wallet) {
      await tonConnectUI.openModal();
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      alert(t`Invalid amount`);
      return;
    }

    if (!depositAddress.trim()) {
      alert(t`Deposit address is missing`);
      return;
    }

    setIsLoading(true);

    try {
      let payload: string | undefined;

      if (memo) {
        payload = beginCell()
          .storeUint(0, 32)
          .storeStringTail(memo)
          .endCell()
          .toBoc()
          .toString('base64');
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 60 * 10,
        messages: [
          {
            address: depositAddress,
            amount: toNano(amount.toString()).toString(),
            payload,
          },
        ],
      });

      onSuccess?.();
    } catch (error) {
      console.error('TON Connect transaction error:', error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleClick()}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 size={20} /> : <Wallet size={20} />}
      {wallet ? (
        isLoading ? (
          t`Confirm in wallet…`
        ) : (
          <Trans
            id="Pay {amount, number} TON with wallet"
            message="Pay {amount, number} TON with wallet"
            values={{ amount }}
          />
        )
      ) : (
        t`Connect wallet to pay`
      )}
    </button>
  );
};
