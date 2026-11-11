import { useState } from 'react';

import { Trans } from '@lingui/react';
import { useLingui } from '@lingui/react/macro';
import { Address, beginCell } from '@ton/core';
import { useUnit } from 'effector-react';
import { Loader2, Wallet } from 'lucide-react';

import { TON_CHAIN_ID } from 'shared/config/ton-network';
import { toNanoSafe } from 'shared/lib/ton';
import { $tonWallet, getTonConnectUI } from 'shared/lib/ton-connect';

export class WrongNetworkError extends Error {
  constructor() {
    super('Wallet is on another network');
  }
}

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
  const wallet = useUnit($tonWallet);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    const tonConnectUI = await getTonConnectUI();

    if (!wallet) {
      await tonConnectUI.openModal();
      return;
    }

    if (wallet.chain !== TON_CHAIN_ID) {
      onError?.(new WrongNetworkError());
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      alert(t`Invalid amount`);
      return;
    }

    if (
      !Address.isFriendly(depositAddress.trim()) &&
      !Address.isRaw(depositAddress.trim())
    ) {
      onError?.(new Error('Invalid deposit address'));
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
        network: TON_CHAIN_ID,
        validUntil: Math.floor(Date.now() / 1000) + 60 * 10,
        messages: [
          {
            address: depositAddress,
            amount: toNanoSafe(amount).toString(),
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
        <Trans
          id="Connect wallet and pay {amount, number} TON"
          message="Connect wallet and pay {amount, number} TON"
          values={{ amount }}
        />
      )}
    </button>
  );
};
