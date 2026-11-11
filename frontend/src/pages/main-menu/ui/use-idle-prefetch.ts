import React from 'react';

import { useRouter } from '@tanstack/react-router';

import { walletModel } from 'entities/wallet';

const IDLE_FALLBACK_MS = 1500;

export const loadDepositDialog = () => import('widgets/deposit-dialog');
export const loadWithdrawModal = () => import('widgets/withdraw');

export const useIdlePrefetch = () => {
  const router = useRouter();

  React.useEffect(() => {
    const prefetch = () => {
      loadDepositDialog().catch(() => undefined);
      loadWithdrawModal().catch(() => undefined);
      walletModel.depositAddressRequested();

      for (const route of ['/game/$roomId', '/history'] as const) {
        router.loadRouteChunk(router.routesById[route])?.catch(() => undefined);
      }
    };

    if (typeof window.requestIdleCallback !== 'function') {
      const timer = window.setTimeout(prefetch, IDLE_FALLBACK_MS);

      return () => window.clearTimeout(timer);
    }

    const handle = window.requestIdleCallback(prefetch);

    return () => window.cancelIdleCallback(handle);
  }, [router]);
};
