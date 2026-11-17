import { useRef, useTransition } from 'react';

import { useUnit } from 'effector-react';

import { $tonWallet } from 'shared/lib/ton-connect';

import { payViaWallet, type WalletPaymentRequest } from '../lib/pay-via-wallet';

interface PaymentOptions extends WalletPaymentRequest {
  onInvalidAmount: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export const useWalletPayment = ({
  onInvalidAmount,
  onSuccess,
  onError,
  ...request
}: PaymentOptions) => {
  const wallet = useUnit($tonWallet);
  const [isLoading, startPayment] = useTransition();
  const paymentLocked = useRef(false);

  const pay = () => {
    if (isLoading || paymentLocked.current) {
      return;
    }

    paymentLocked.current = true;

    startPayment(async () => {
      try {
        const result = await payViaWallet(request, wallet?.chain ?? null);

        if (result === 'sent') {
          onSuccess?.();
        } else if (result === 'invalid-amount') {
          onInvalidAmount();
        }
      } catch (error) {
        console.error('TON Connect transaction error:', error);
        onError?.(error);
      } finally {
        paymentLocked.current = false;
      }
    });
  };

  return { hasWallet: Boolean(wallet), isLoading, pay };
};
