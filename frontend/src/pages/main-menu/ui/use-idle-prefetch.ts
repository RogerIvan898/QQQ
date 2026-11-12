import React from 'react';

import { useRouter } from '@tanstack/react-router';

import { walletModel } from 'entities/wallet';
import { runWhenIdle } from 'shared/utils/schedule';

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

    return runWhenIdle(prefetch);
  }, [router]);
};
