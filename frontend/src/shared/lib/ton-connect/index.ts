import type { TonConnectUI, Wallet } from '@tonconnect/ui-react';
import { createEvent, createStore } from 'effector';

import { getTonConnectManifestUrl } from 'shared/config/tonconnect';

// TON Connect UI is heavy (UI kit + crypto), so it is loaded on demand instead
// of wrapping the whole app in TonConnectUIProvider. Components read the
// wallet from $tonWallet and get the instance via getTonConnectUI().

export interface TonWalletInfo {
  /** Raw address as reported by the wallet. */
  address: string;
  /** User-friendly address, same as useTonAddress() returned. */
  friendlyAddress: string;
}

const tonWalletChanged = createEvent<TonWalletInfo | null>();

export const $tonWallet = createStore<TonWalletInfo | null>(null, {
  skipVoid: false,
}).on(tonWalletChanged, (_, wallet) => wallet);

let instancePromise: Promise<TonConnectUI> | null = null;
let bridgePaused = false;

export const getTonConnectUI = (): Promise<TonConnectUI> => {
  if (instancePromise) {
    return instancePromise;
  }

  const promise = import('@tonconnect/ui-react').then(
    ({ TonConnectUI, toUserFriendlyAddress, CHAIN }) => {
      const ui = new TonConnectUI({
        manifestUrl: getTonConnectManifestUrl(),
      });

      const sync = (wallet: Wallet | null) =>
        tonWalletChanged(
          wallet
            ? {
                address: wallet.account.address,
                friendlyAddress: toUserFriendlyAddress(
                  wallet.account.address,
                  wallet.account.chain === (CHAIN.TESTNET as string)
                ),
              }
            : null
        );

      sync(ui.wallet);
      ui.onStatusChange(sync);

      if (bridgePaused) {
        ui.connector.pauseConnection();
      }

      return ui;
    }
  );

  instancePromise = promise;
  promise.catch(() => {
    if (instancePromise === promise) {
      instancePromise = null;
    }
  });

  return promise;
};

/** Restores a saved wallet connection once the app is idle. */
export const preloadTonConnect = () => {
  const start = () => {
    getTonConnectUI().catch((error: unknown) =>
      console.warn('[TonConnect] Failed to load', error)
    );
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 1500);
  }
};

/**
 * A restored wallet session keeps an SSE connection to the wallet bridge open.
 * Nothing at the poker table needs it, so it is paused there.
 */
export const setTonConnectPaused = (paused: boolean) => {
  if (bridgePaused === paused) return;

  bridgePaused = paused;

  instancePromise
    ?.then(ui => {
      if (bridgePaused !== paused) return;

      if (paused) {
        ui.connector.pauseConnection();
      } else {
        void ui.connector.unPauseConnection().catch(() => undefined);
      }
    })
    .catch(() => undefined);
};
