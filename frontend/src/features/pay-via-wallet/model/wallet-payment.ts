import { createEffect, createEvent, sample } from 'effector';

import { $tonWallet } from 'shared/lib/ton-connect';

import {
  payViaWallet,
  type WalletPaymentRequest,
} from '../utils/pay-via-wallet';

interface PaymentOptions extends WalletPaymentRequest {
  onInvalidAmount: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const payViaWalletFx = createEffect(
  async ({
    walletChain,
    onInvalidAmount,
    onSuccess,
    onError,
    ...request
  }: PaymentOptions & { walletChain: string | null }) => {
    try {
      const result = await payViaWallet(request, walletChain);

      if (result === 'sent') {
        onSuccess?.();
      } else if (result === 'invalid-amount') {
        onInvalidAmount();
      }
    } catch (error) {
      console.error('TON Connect transaction error:', error);
      onError?.(error);
    }
  }
);

export const walletPaymentRequested = createEvent<PaymentOptions>();
export const $walletPaymentPending = payViaWalletFx.pending;
export const $hasPaymentWallet = $tonWallet.map(Boolean);

sample({
  clock: walletPaymentRequested,
  source: { wallet: $tonWallet, pending: $walletPaymentPending },
  filter: ({ pending }) => !pending,
  fn: ({ wallet }, options) => ({
    ...options,
    walletChain: wallet?.chain ?? null,
  }),
  target: payViaWalletFx,
});
