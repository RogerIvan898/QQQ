import { createEffect, createEvent, sample } from 'effector';

import { $tonWallet } from 'shared/lib/ton-connect';

import { payViaWallet } from '../utils/pay-via-wallet';

import type { PaymentOptions } from './types';

const payViaWalletFx = createEffect(
  async ({
    walletChain,
    onSuccess,
    onError,
    ...request
  }: PaymentOptions & { walletChain: string | null }) => {
    try {
      const result = await payViaWallet(request, walletChain);

      if (result === 'sent') {
        onSuccess?.();
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
